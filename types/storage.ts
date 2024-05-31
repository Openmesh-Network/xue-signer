import { PersistentJson } from "../utils/persistent-json.js";

export interface CodesStorage {
  [code: string]: {
    expiry: Date;
  };
}

export interface Storage {
  codes: PersistentJson<CodesStorage>;
}
