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

    /// Writes the asset's current version (edited if edited) plus a Live Photo's motion video into a
    /// fresh temporary directory, downloading from iCloud when needed.
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

      let baseName = Self.baseName(for: asset)
      var files: [[String: Any]] = []
      for (index, resource) in resources.enumerated() {
        let filename = Self.filename(baseName: baseName, resource: resource)
        let url = directory.appendingPathComponent(filename)
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        options.progressHandler = { [weak self] progress in
          let overall = (Double(index) + progress) / Double(resources.count)
          self?.sendEvent("onExportProgress", ["id": id, "progress": overall])
        }
        do {
          try await PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options)
        } catch {
          try? FileManager.default.removeItem(at: directory)
          throw Self.exportException(for: error)
        }
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        files.append([
          "uri": url.absoluteString,
          "filename": filename,
          "mimeType": Self.mimeType(for: resource),
          "size": (attributes[.size] as? NSNumber)?.int64Value ?? 0,
        ])
      }
      return ["directory": directory.absoluteString, "files": files]
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

  static func uploadResources(for asset: PHAsset) -> [PHAssetResource] {
    let resources = PHAssetResource.assetResources(for: asset)
    func first(_ preferred: PHAssetResourceType, else fallback: PHAssetResourceType) -> PHAssetResource? {
      resources.first { $0.type == preferred } ?? resources.first { $0.type == fallback }
    }
    switch asset.mediaType {
    case .image:
      let still = first(.fullSizePhoto, else: .photo)
      let motion = asset.mediaSubtypes.contains(.photoLive) ? first(.fullSizePairedVideo, else: .pairedVideo) : nil
      return [still, motion].compactMap { $0 }
    case .video:
      return [first(.fullSizeVideo, else: .video)].compactMap { $0 }
    default:
      return []
    }
  }

  /// "IMG_1234" from the original resource, so an edited "FullSizeRender.jpg" uploads as "IMG_1234.jpg".
  static func baseName(for asset: PHAsset) -> String {
    let resources = PHAssetResource.assetResources(for: asset)
    let original = resources.first { $0.type == .photo || $0.type == .video } ?? resources.first
    let name = original?.originalFilename ?? asset.localIdentifier.replacingOccurrences(of: "/", with: "_")
    return (name as NSString).deletingPathExtension
  }

  static func filename(baseName: String, resource: PHAssetResource) -> String {
    let ext = (resource.originalFilename as NSString).pathExtension
    return ext.isEmpty ? baseName : "\(baseName).\(ext)"
  }

  static func mimeType(for resource: PHAssetResource) -> String {
    UTType(resource.uniformTypeIdentifier)?.preferredMIMEType ?? "application/octet-stream"
  }

  static func exportException(for error: Error) -> Exception {
    let nsError = error as NSError
    let isNetwork = nsError.domain == NSURLErrorDomain || nsError.domain.contains("Cloud")
    if isNetwork {
      return Exception(name: "ICloudDownloadFailed", description: "Couldn't download this item from iCloud.", code: "ICLOUD_DOWNLOAD_FAILED")
    }
    return Exception(name: "ExportFailed", description: nsError.localizedDescription, code: "EXPORT_FAILED")
  }
}
