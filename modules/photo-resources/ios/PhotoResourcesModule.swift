import ExpoModulesCore
import Photos
import UniformTypeIdentifiers

/// Reads PhotoKit resource sizes and exports the files that represent an asset, for uploading elsewhere.
public class PhotoResourcesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotoResources")

    Events("onExportProgress")

    /// Total bytes of every resource PhotoKit keeps for each asset (photo, Live Photo video, edits).
    /// An id maps to null when the asset is missing or any resource has no readable size.
    AsyncFunction("getSizes") { (ids: [String]) -> [String: Any] in
      var sizes: [String: Any] = [:]
      for id in ids {
        sizes[id] = NSNull()
      }
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      assets.enumerateObjects { asset, _, _ in
        if let total = Self.totalSize(of: asset) {
          sizes[asset.localIdentifier] = total
        }
      }
      return sizes
    }

    /// Writes every file Photos keeps with the asset's media (the original, a RAW, a Live Photo's video, and the
    /// edited versions of each) into a fresh temporary directory, downloading from iCloud when needed.
    AsyncFunction("exportForUpload") { (id: String) async throws -> [String: Any] in
      guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
        throw Exception(name: "AssetNotFound", description: "This item is no longer in your library.", code: "ASSET_NOT_FOUND")
      }
      let resources = Self.uploadResources(for: asset)
      guard !resources.isEmpty else {
        throw Exception(name: "NothingToExport", description: "This item has no file to copy.", code: "EXPORT_FAILED")
      }

      let directory = Self.exportRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

      var exported: [[String: Any]] = []
      for (index, (resource, type)) in resources.enumerated() {
        // Upload names are decided in JS; on disk, the index keeps same-named resources apart.
        let ext = (resource.originalFilename as NSString).pathExtension
        let url = directory.appendingPathComponent(ext.isEmpty ? "\(index)" : "\(index).\(ext)")
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        options.progressHandler = { [weak self] progress in
          let overall = (Double(index) + progress) / Double(resources.count)
          self?.sendEvent("onExportProgress", ["id": id, "progress": overall])
        }
        do {
          try await PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options)
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          exported.append([
            "uri": url.absoluteString,
            "type": type,
            "originalFilename": resource.originalFilename,
            "mimeType": Self.mimeType(for: resource),
            "size": (attributes[.size] as? NSNumber)?.int64Value ?? 0,
          ])
        } catch {
          try? FileManager.default.removeItem(at: directory)
          throw Self.exportException(for: error)
        }
      }
      return ["directory": directory.absoluteString, "resources": exported]
    }

    /// Removes every temporary export, e.g. leftovers from a previous launch.
    AsyncFunction("clearExports") {
      try? FileManager.default.removeItem(at: Self.exportRoot)
    }
  }

  static var exportRoot: URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("photo-resources", isDirectory: true)
  }

  static func totalSize(of asset: PHAsset) -> Int64? {
    let resources = PHAssetResource.assetResources(for: asset)
    guard !resources.isEmpty else {
      return nil
    }
    let selector = NSSelectorFromString("fileSize")
    var total: Int64 = 0
    for resource in resources {
      // `fileSize` is undocumented. Guard with responds(to:) so a removed key degrades to "unknown" instead of crashing.
      guard resource.responds(to: selector), let size = resource.value(forKey: "fileSize") as? NSNumber else {
        return nil
      }
      total += size.int64Value
    }
    return total
  }

  /// The media resource types, in upload order: stills, then a Live Photo's video, then video.
  static let uploadTypes: [(PHAssetResourceType, String)] = [
    (.photo, "photo"),
    (.alternatePhoto, "alternatePhoto"),
    (.fullSizePhoto, "fullSizePhoto"),
    (.pairedVideo, "pairedVideo"),
    (.fullSizePairedVideo, "fullSizePairedVideo"),
    (.video, "video"),
    (.fullSizeVideo, "fullSizeVideo"),
  ]

  /// Resources that aren't media of their own: the edit recipe, the intermediate renders an edit was applied on top of,
  /// and the temporary proxy shown while the camera finishes processing a photo.
  static let skippedTypes: Set<PHAssetResourceType> = {
    var types: Set<PHAssetResourceType> = [
      .adjustmentData, .adjustmentBasePhoto, .adjustmentBasePairedVideo, .adjustmentBaseVideo,
    ]
    if #available(iOS 17, *) {
      types.insert(.photoProxy)
    }
    return types
  }()

  /// Every resource except `skippedTypes`: the known media types in `uploadTypes` order, then any other type as
  /// "other". Copying a type this module doesn't know costs an extra file; skipping it could lose data on delete.
  static func uploadResources(for asset: PHAsset) -> [(PHAssetResource, String)] {
    let resources = PHAssetResource.assetResources(for: asset).filter { !skippedTypes.contains($0.type) }
    let known = uploadTypes.flatMap { type, name in
      resources.filter { $0.type == type }.map { ($0, name) }
    }
    let knownTypes = Set(uploadTypes.map(\.0))
    let other = resources.filter { !knownTypes.contains($0.type) }.map { ($0, "other") }
    return known + other
  }

  static func mimeType(for resource: PHAssetResource) -> String {
    UTType(resource.uniformTypeIdentifier)?.preferredMIMEType ?? "application/octet-stream"
  }

  static func exportException(for error: Error) -> Exception {
    let chain = errorChain(error as NSError)
    let outOfSpace = chain.contains {
      ($0.domain == NSCocoaErrorDomain && $0.code == NSFileWriteOutOfSpaceError)
        || ($0.domain == NSPOSIXErrorDomain && $0.code == Int(ENOSPC))
    }
    if outOfSpace {
      return Exception(name: "NotEnoughSpace", description: "Not enough free space to copy this item.", code: "NOT_ENOUGH_SPACE")
    }
    let network = chain.contains {
      $0.domain == NSURLErrorDomain
        || $0.domain.contains("Cloud")
        || ($0.domain == PHPhotosErrorDomain
          && ($0.code == PHPhotosError.Code.networkAccessRequired.rawValue
            || $0.code == PHPhotosError.Code.networkError.rawValue))
    }
    if network {
      return Exception(name: "ICloudDownloadFailed", description: "Couldn't download this item from iCloud.", code: "ICLOUD_DOWNLOAD_FAILED")
    }
    return Exception(name: "ExportFailed", description: (error as NSError).localizedDescription, code: "EXPORT_FAILED")
  }

  /// The error and the errors it wraps: PhotoKit often reports network and disk failures as an underlying error.
  static func errorChain(_ error: NSError) -> [NSError] {
    var chain = [error]
    while chain.count < 5, let underlying = chain.last?.userInfo[NSUnderlyingErrorKey] as? NSError {
      chain.append(underlying)
    }
    return chain
  }

}
