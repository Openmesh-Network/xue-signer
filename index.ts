import { config as loadEnv } from "dotenv";
import express from "express";
import storageManager from "node-persist";
import { PersistentJson } from "./utils/persistent-json.js";
import { CodesStorage, Storage } from "./types/storage.js";
import { registerRoutes } from "./api/simple-router.js";
import { readFile } from "fs/promises";

async function start() {
  const loadEnvResult = loadEnv();
  if (loadEnvResult.error) {
    console.warn(`Error while loading .env: ${loadEnvResult.error}`);
  }

  // Data (memory + json files (synced) currently, could be migrated to a database solution if needed in the future)
  await storageManager.init({ dir: "storage" });
  const storage: Storage = {
    codes: new PersistentJson<CodesStorage>("codes", {}),
  };

  process.on("SIGINT", async () => {
    console.log("Stopping...");

    await Promise.all(
      Object.values(storage).map((storageItem) => {
        return storageItem.update(() => {}); // Save all memory values to disk
      })
    );
    process.exit();
  });

  // Webserver
  const app = express();
  registerRoutes(app, storage);

  var server = app.listen(process.env.PORT ?? 3001, () => {
    const addressInfo = server.address() as any;
    var host = addressInfo.address;
    var port = addressInfo.port;
    console.log(`Webserver started on ${host}:${port}`);
  });

  process.stdin.resume();

  process.stdin.on("data", (input) => {
    try {
      const command = input.toString();
      if (command.startsWith("addCode ")) {
        const args = command.split(" ").slice(1);
        const code = args[0].trim();
        storage.codes
          .update((codes) => {
            const expiry = new Date();
            expiry.setTime(expiry.getTime() + 7 * 24 * 60 * 60 * 1000);
            codes[code] = {
              expiry: expiry.toISOString(),
            };
          })
          .then(() => console.log("Code added!"))
          .catch((err) => console.error(`Error while executing add code: ${err}`));
      } else if (command.startsWith("addCodesFromFile ")) {
        const args = command.split(" ").slice(1);
        const file = args[0].trim();

        const expiry = new Date();
        expiry.setTime(expiry.getTime() + 7 * 24 * 60 * 60 * 1000);
        readFile(file, { encoding: "utf-8" }).then((fileContent) => {
          const fileCodes = fileContent.split("\n").filter((str) => str);
          storage.codes
            .update((codes) => {
              for (let i = 0; i < fileCodes.length; i++) {
                codes[fileCodes[i]] = {
                  expiry: expiry.toISOString(),
                };
              }
            })
            .then(() => console.log(`${fileCodes.length} codes added!`))
            .catch((err) => console.error(`Error while adding code: ${err}`));
        });
      } else if (command.startsWith("extendCodes ")) {
        const args = command.split(" ").slice(1);
        const days = Number(args[0].trim());
        storage.codes
          .update((codes) => {
            Object.values(codes).forEach((code) => {
              code.expiry = new Date(new Date(code.expiry).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
            });
          })
          .then(() => console.log("Codes extended!"))
          .catch((err) => console.error(`Error while executing extend codes: ${err}`));
      }
    } catch (err) {
      console.error(`Error interpreting command: ${err}`);
    }
  });
}

start().catch(console.error);
