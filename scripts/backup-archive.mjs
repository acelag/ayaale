import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

const magic = Buffer.from("AYAALE01");
const headerLength = magic.length + 12;

// Packages an ALREADY PREPARED export. Does not export hosted data, upload it, or extract tar files.
export async function backupArchive({ mode, input, output, key }) {
  if (
    !["seal", "verify", "open"].includes(mode) ||
    !input ||
    !/^[A-Za-z0-9+/]{43}=$/.test(key ?? "") ||
    (mode !== "verify" && !output)
  )
    throw new Error("Invalid backup configuration");
  const keyBytes = Buffer.from(key, "base64");
  if (keyBytes.length !== 32 || keyBytes.toString("base64") !== key) throw new Error("Invalid key");
  let destination;
  let created = false;
  const hash = createHash("sha256");
  try {
    // Exclusive creation prevents overwriting originals, symlink targets or previous backups.
    if (mode !== "verify") {
      destination = await open(output, "wx", 0o600);
      created = true;
    }
    if (mode === "seal") {
      const header = Buffer.concat([magic, randomBytes(12)]);
      const cipher = createCipheriv("aes-256-gcm", keyBytes, header.subarray(magic.length));
      cipher.setAAD(header);
      await destination.write(header);
      hash.update(header);
      const digest = new Transform({
        transform(chunk, _encoding, done) {
          hash.update(chunk);
          done(null, chunk);
        },
      });
      await pipeline(
        createReadStream(input),
        cipher,
        digest,
        createWriteStream(output, { fd: destination.fd, autoClose: false, start: header.length }),
      );
      const tag = cipher.getAuthTag();
      await destination.write(tag, 0, tag.length, (await destination.stat()).size);
      hash.update(tag);
      await destination.sync();
    } else {
      const source = await open(input, "r");
      try {
        const size = (await source.stat()).size;
        if (size < headerLength + 16) throw new Error("Truncated archive");
        const header = Buffer.alloc(headerLength);
        const tag = Buffer.alloc(16);
        await source.read(header, 0, header.length, 0);
        await source.read(tag, 0, 16, size - 16);
        if (!header.subarray(0, magic.length).equals(magic)) throw new Error("Invalid archive");
        const decipher = createDecipheriv("aes-256-gcm", keyBytes, header.subarray(magic.length));
        decipher.setAAD(header);
        decipher.setAuthTag(tag);
        const sink =
          mode === "open"
            ? createWriteStream(output, { fd: destination.fd, autoClose: false })
            : new Writable({
                write(_chunk, _encoding, done) {
                  done();
                },
              });
        // Empty plaintext is valid; avoid a start > end stream range.
        if (size === headerLength + 16) {
          decipher.end();
          await pipeline(decipher, sink);
        } else {
          await pipeline(
            createReadStream(input, { start: headerLength, end: size - 17 }),
            decipher,
            sink,
          );
        }
        if (destination) await destination.sync();
      } finally {
        await source.close();
      }
    }
    return mode === "seal" ? { version: 1, sha256: hash.digest("hex") } : { authenticated: true };
  } catch (error) {
    if (destination) {
      await destination.close().catch(() => {});
      destination = undefined;
    }
    if (created)
      await unlink(output).catch((cleanupError) => {
        if (cleanupError.code !== "ENOENT") throw new Error("Partial output cleanup failed");
      });
    throw error;
  } finally {
    if (destination) await destination.close().catch(() => {});
    keyBytes.fill(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, input, output] = process.argv.slice(2);
    console.log(
      JSON.stringify(
        await backupArchive({ mode, input, output, key: process.env.AYAALE_BACKUP_KEY }),
      ),
    );
  } catch {
    console.error(
      "Backup archive operation failed. Check protected local configuration and output cleanup before retrying.",
    );
    process.exitCode = 1;
  }
}
