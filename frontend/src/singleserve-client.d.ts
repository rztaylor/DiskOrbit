declare module "singleserve-client" {
  export interface HeartbeatResult {
    ok: boolean;
    failures: number;
    tabID: string;
    checkedAt: Date;
  }

  export interface ServerUnavailableResult {
    failures: number;
    tabID: string;
  }

  export interface ConnectOptions {
    onHeartbeat?: (result: HeartbeatResult) => void;
    onServerUnavailable?: (result: ServerUnavailableResult) => void;
  }

  export interface SingleserveSession {
    readonly tabID: string;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    health(signal?: AbortSignal): Promise<boolean>;
    disconnect(): Promise<boolean>;
    requestShutdown(): Promise<unknown>;
    stop(): void;
  }

  export class SingleserveError extends Error {
    readonly status: number;
    readonly code: string;
  }

  export function connect(options?: ConnectOptions): Promise<SingleserveSession>;
}
