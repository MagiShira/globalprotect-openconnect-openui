export interface Gateway {
  name: string;
  address: string;
  priority: number;
  priorityRules: { name: string; priority: number }[];
}

export interface ConnectInfo {
  portal: string;
  gateway: Gateway;
  gateways: Gateway[];
}

// Matches Rust VpnState enum with serde(rename_all = "camelCase")
export type VpnState =
  | "disconnected"
  | "disconnecting"
  | { connecting: ConnectInfo }
  | { connected: ConnectInfo };

export type PreloginType =
  | { type: "saml" }
  | {
      type: "standard";
      authMessage: string;
      labelUsername: string;
      labelPassword: string;
    };
