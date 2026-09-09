export function toArrayBuffer(input: unknown): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (typeof input === 'string') {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  throw new Error('Fichier binaire manquant (base64 ou ArrayBuffer attendu).');
}
