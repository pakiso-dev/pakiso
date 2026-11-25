# Encryption

Pakiso separates *what* gets persisted (handled by a `PakisoStorageAdapter`)
from *how payloads are encoded* on their way in and out of storage. That
encoding boundary is a `PayloadCodec`, and `@pakiso/core` ships one
implementation: AES-256-GCM.

#### `CodedStorageAdapter`

`CodedStorageAdapter` wraps any `PakisoStorageAdapter` and a `PayloadCodec`:
it transparently encodes run `input`/`output` and event `payload` fields
before delegating writes to the inner adapter, and decodes them on reads.
Run metadata (`status`, timestamps, keys) and event metadata (`seq`, `type`,
`stepName`, `durationMs`) pass through unchanged — only the opaque payload
fields are encrypted at rest.

```ts
import { CodedStorageAdapter, InMemoryStorageAdapter } from '@pakiso/core';

const storage = new CodedStorageAdapter(new InMemoryStorageAdapter(), codec);
```

#### `Aes256GcmPayloadCodec`

```ts
interface EncryptionKey {
  /** Key identifier stamped onto new envelopes so decode() can pick the right key during rotation */
  kid: string;
  /** 32-byte (256-bit) AES key, base64-encoded */
  key: string;
}

interface Aes256GcmPayloadCodecOptions {
  /** Active key used for encode(); its kid is stamped onto new envelopes */
  activeKey: EncryptionKey;
  /** Additional keys accepted for decode() only (e.g. retired keys during rotation) */
  previousKeys?: EncryptionKey[];
}
```

```ts
import { Aes256GcmPayloadCodec } from '@pakiso/core';

const codec = new Aes256GcmPayloadCodec({
  activeKey: { kid: 'k1', key: process.env.PAKISO_ENCRYPTION_KEY! },
  previousKeys: [{ kid: 'k0', key: process.env.PAKISO_ENCRYPTION_KEY_PREVIOUS! }],
});
```

Each `key` must base64-decode to exactly 32 bytes, or the constructor
throws. Every encode call uses a fresh random 12-byte IV; the resulting
envelope (`{ __pakisoEnc, kid, iv, tag, ciphertext }`) records which key
encrypted it, so decode can look the right key up by `kid` — this is what
makes **key rotation** possible: keep encrypting new payloads with a new
`activeKey`, while still being able to decode payloads written under an
older key by listing it in `previousKeys`.

```ts
codec.forgetKey('k0'); // removes a retired key; throws if you try to remove the active key
```

#### Using it with `@pakiso/nest`

`PakisoModule` wires this up for you automatically — see
[PakisoModule](/nestjs/module#encryption) — by setting the
`PAKISO_ENCRYPTION_KEY` (and optionally `PAKISO_ENCRYPTION_KEY_ID`)
environment variable, or by passing an explicit `codec` option.

::: warning Key management is out of scope
The codec encrypts/decrypts payloads given keys you provide; it does not
generate, store, or rotate keys for you. Use a secrets manager (AWS KMS,
HashiCorp Vault, ...) to provision `PAKISO_ENCRYPTION_KEY`.
:::
