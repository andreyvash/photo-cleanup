import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { messageOf } from '@/lib/errors';
import { DRIVE_FOLDERS_KEY, useSendSession } from '@/send/send-session';
import { useService } from '@/services';
import { colors, radius, spacing, type } from '@/theme';

export default function NewFolderSheet() {
  const router = useRouter();
  const drive = useService('drive');
  const queryClient = useQueryClient();
  const chooseFolder = useSendSession((s) => s.chooseFolder);
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: (folderName: string) => drive.createFolder(folderName),
    onSuccess: async (folder) => {
      chooseFolder(folder.id);
      await queryClient.invalidateQueries({ queryKey: [DRIVE_FOLDERS_KEY] });
      router.back();
    },
  });
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !create.isPending;
  const submit = () => {
    if (canCreate) create.mutate(trimmed);
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Folder name"
        accessibilityLabel="Folder name"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={120}
        style={styles.input}
        placeholderTextColor={colors.tertiaryLabel}
      />
      {create.isError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {messageOf(create.error, 'Couldn’t create the folder.')}
        </Text>
      ) : null}
      <Button title="Create" disabled={!canCreate} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.l, gap: spacing.m },
  input: {
    ...type.body,
    color: colors.label,
    minHeight: 48,
    paddingHorizontal: spacing.l,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  error: { ...type.footnote, color: colors.destructive },
});
