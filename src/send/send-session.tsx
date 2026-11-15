import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { GoogleAccount, GoogleAuth } from '@/google/auth';
import { useService } from '@/services';
import { createTransferQueue, type TransferQueue, type TransferState } from '@/transfer/queue';

export type SendSessionState = {
  status: 'checking' | 'signedOut' | 'signedIn';
  account: GoogleAccount | null;
  signingIn: boolean;
  error: string | null;
  /** The Drive folder the user picked for this send. */
  folderId: string | null;
  restore(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  chooseFolder(folderId: string): void;
};

function createSendSession(auth: GoogleAuth) {
  return createStore<SendSessionState>()((set) => ({
    status: 'checking',
    account: null,
    signingIn: false,
    error: null,
    folderId: null,
    restore: async () => {
      try {
        const account = await auth.restore();
        set({ status: account ? 'signedIn' : 'signedOut', account });
      } catch {
        set({ status: 'signedOut', account: null });
      }
    },
    signIn: async () => {
      set({ signingIn: true, error: null });
      try {
        const account = await auth.signIn();
        set(account ? { status: 'signedIn', account } : {});
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Couldn’t sign in to Google.' });
      } finally {
        set({ signingIn: false });
      }
    },
    signOut: async () => {
      await auth.signOut();
      set({ status: 'signedOut', account: null, folderId: null });
    },
    chooseFolder: (folderId) => set({ folderId }),
  }));
}

type SendSession = {
  session: ReturnType<typeof createSendSession>;
  queue: TransferQueue;
  queryClient: QueryClient;
};

const SendSessionContext = createContext<SendSession | null>(null);

/** Lives as long as the Send modal: the Google account, the chosen folder and the transfer in progress. */
export function SendSessionProvider({ children }: { children: ReactNode }) {
  const googleAuth = useService('googleAuth');
  const drive = useService('drive');
  const exporter = useService('exporter');
  const [value] = useState<SendSession>(() => ({
    session: createSendSession(googleAuth),
    queue: createTransferQueue({ drive, exporter }),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  }));

  useEffect(() => {
    void value.session.getState().restore();
    return () => value.queue.stop();
  }, [value]);

  return (
    <SendSessionContext.Provider value={value}>
      <QueryClientProvider client={value.queryClient}>{children}</QueryClientProvider>
    </SendSessionContext.Provider>
  );
}

function useSendContext() {
  const context = useContext(SendSessionContext);
  if (!context) throw new Error('Send screens must be inside SendSessionProvider');
  return context;
}

export function useSendSession<T>(selector: (state: SendSessionState) => T): T {
  return useStore(useSendContext().session, selector);
}

export function useTransferQueue(): TransferQueue {
  return useSendContext().queue;
}

export function useTransfer<T>(selector: (state: TransferState) => T): T {
  return useStore(useSendContext().queue.store, selector);
}
