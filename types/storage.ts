import { PersistentJson } from "../utils/persistent-json.js";

export interface CodesStorage {
  [code: string]: {
    expiry: string;
  };
}

export interface Storage {
  codes: PersistentJson<CodesStorage>;
}
