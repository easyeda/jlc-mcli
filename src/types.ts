export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JSONSchema;
  [key: string]: unknown;
}

export interface GroupOptions {
  summary: string;
  description?: string;
}

export interface CommandExample {
  title: string;
  input: Record<string, unknown>;
}

export interface CommandContext {
  services?: Record<string, unknown>;
}

export interface CommandResult {
  data?: unknown;
  next?: Array<{ path: string; reason: string }>;
}

export interface CommandOptions {
  summary: string;
  description?: string;
  input: JSONSchema;
  examples?: CommandExample[];
  related?: string[];
  handler: (
    input: Record<string, unknown>,
    ctx: CommandContext,
  ) => Promise<CommandResult> | CommandResult;
  display?: (result: CommandResult) => void;
}

export interface CommandNode {
  path: string;
  argv: string[];
  name: string;
  summary: string;
  description?: string;
  input?: JSONSchema;
  examples?: CommandExample[];
  related?: string[];
  handler?: CommandOptions["handler"];
  display?: CommandOptions["display"];
  isGroup: boolean;
  children: Map<string, CommandNode>;
}

export interface CommandGroup {
  command(name: string, opts: CommandOptions): void;
  group(name: string, opts: GroupOptions): CommandGroup;
}

export interface McliApp {
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  group(name: string, opts: GroupOptions): CommandGroup;
  command(name: string, opts: CommandOptions): void;
  resolve(argv: string[]): CommandNode | null;
  allCommands(): CommandNode[];
}
