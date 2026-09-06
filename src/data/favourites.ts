import type { Favourite } from "../types";

export const DEFAULT_FAVOURITES: Favourite[] = [
  { id: "fav-db-central", fromId: "db-plaza", toId: "central-pier3", label: "DB → Central" },
  { id: "fav-central-db", fromId: "central-pier3", toId: "db-plaza", label: "Central → DB" },
  { id: "fav-central-wc", fromId: "central-mtr", toId: "wan-chai", label: "Central → Wan Chai" },
  { id: "fav-wc-central", fromId: "wan-chai", toId: "central-mtr", label: "Wan Chai → Central" },
  { id: "fav-sunny-mk", fromId: "sunny-bay", toId: "mong-kok", label: "Sunny Bay → Mong Kok" },
  { id: "fav-mk-sunny", fromId: "mong-kok", toId: "sunny-bay", label: "Mong Kok → Sunny Bay" },
  { id: "fav-sunny-ssp", fromId: "sunny-bay", toId: "sham-shui-po", label: "Sunny Bay → Sham Shui Po" },
  { id: "fav-ssp-sunny", fromId: "sham-shui-po", toId: "sunny-bay", label: "Sham Shui Po → Sunny Bay" },
  { id: "fav-db-tc", fromId: "db-plaza", toId: "tung-chung", label: "DB → Tung Chung" },
  { id: "fav-db-airport", fromId: "db-plaza", toId: "airport", label: "DB → Airport" },
  { id: "fav-exchange-wc", fromId: "exchange-square", toId: "wan-chai", label: "Exchange Sq → Wan Chai" },
  { id: "fav-tst-central", fromId: "tsim-sha-tsui", toId: "central-mtr", label: "TST → Central" },
];

export const FAV_STORAGE_KEY = "hk-transit-favourites-v1";
