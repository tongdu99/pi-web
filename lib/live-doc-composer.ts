export type LiveDocContextMode = "section" | "relevant" | "full";

export interface LiveDocComposerTarget {
  docId: string;
  sectionId: string;
  sectionLabel: string;
  selectedText: string;
  active: boolean;
}

export interface LiveDocComposerResult {
  id: number;
  status: "success" | "error";
  message: string;
  threadEntryId?: string;
}

export interface LiveDocComposerState {
  target: LiveDocComposerTarget | null;
  contextMode: LiveDocContextMode;
  busy: boolean;
  phase: string | null;
  result: LiveDocComposerResult | null;
  canSend: boolean;
  active: boolean;
  onActivate: () => void;
  onContextModeChange: (mode: LiveDocContextMode) => void;
  onTargetWholeDocument: (docId: string) => void;
  onClearTarget: () => void;
  onSend: (message: string) => Promise<boolean>;
  onAbort: () => void;
  onOpenConversation: (threadEntryId: string) => void;
}
