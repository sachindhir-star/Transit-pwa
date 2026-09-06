export type Operator = "KMB" | "CTB" | "DB" | "FERRY" | "MTR" | "WALK";

export interface Place {
  id: string;
  name: string;
  nameZh?: string;
  area: "DB" | "Island" | "Kowloon" | "Lantau" | "Other";
  lat: number;
  lng: number;
  aliases?: string[];
  kind?: "pier" | "plaza" | "mtr" | "bus" | "area";
}

export interface StopPoint {
  id: string;
  name: string;
  nameZh?: string;
  lat: number;
  lng: number;
  operatorStopId?: string;
}

export interface TripLeg {
  mode: Operator;
  route?: string;
  routeName?: string;
  direction?: "O" | "I" | "outbound" | "inbound";
  serviceType?: string;
  fromStop: StopPoint;
  toStop: StopPoint;
  /** Ordered shape for the map (boarding → alight, optionally via intermediate stops) */
  shape: StopPoint[];
  durationMin: number;
  fareHkd?: number;
  notes?: string;
  /** Live ETA API hook when available */
  eta?: {
    operator: "KMB" | "CTB";
    stopId: string;
    route: string;
    serviceType?: string;
    /** Citybus dir filter: O outbound / I inbound */
    dir?: "O" | "I";
  };
  /** Honest label when no public GPS feed */
  trackingMode: "live-eta" | "schedule" | "walk" | "mtr-hint";
}

export interface TripOption {
  id: string;
  summary: string;
  totalMin: number;
  totalFareHkd: number;
  legs: TripLeg[];
  tags?: string[];
}

export interface Favourite {
  id: string;
  fromId: string;
  toId: string;
  label: string;
}

export interface LiveEta {
  etaIso: string | null;
  minutes: number | null;
  dest: string;
  remark?: string;
  dataTimestamp?: string;
}

export interface InferredBus {
  id: string;
  lat: number;
  lng: number;
  etaMinutes: number;
  label: string;
  mode: "eta-inferred";
  /** Degrees clockwise from north — road heading toward next stop. */
  heading?: number;
  nextStopName?: string;
  /** Short destination from the polled get_bus_stops variant (e.g. "Tung Chung"). */
  destinationLabel?: string;
}
