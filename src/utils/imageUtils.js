// Compresses a photo (e.g. a supplier invoice) down to a JPEG data URL small
// enough to store directly as a Firestore field, instead of needing a
// separate Firebase Storage bucket/rules setup. This reuses the exact same
// offline-first sync path every other write in this app already goes
// through (persistentLocalCache + saveDocument's sanitizer) - a photo added
// with no signal queues and syncs later exactly like everything else.
// Firestore's hard per-document limit is 1MB; MAX_DATA_URL_LENGTH leaves
// comfortable headroom for the rest of the analysis entry's fields.
const MAX_DIMENSION = 1400;
const MAX_DATA_URL_LENGTH = 700 * 1024;

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read the selected photo.'));
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Step quality down until it fits, rather than a single fixed
          // quality - a busy, detailed invoice photo compresses far less
          // than a plain one at the same quality setting.
          let quality = 0.7;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.2) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          if (dataUrl.length > MAX_DATA_URL_LENGTH) {
            reject(new Error('This photo is too large even after compression. Try a tighter, less detailed shot of just the cost lines.'));
            return;
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// For file types that can't be shrunk the way a photo can (PDF) - just
// base64-encode it and reject up front if it won't fit under the same
// per-document budget compressImageFile targets. No compression step, so
// this cap is unforgiving for a large multi-page scan - the error message
// says so explicitly rather than failing silently.
export function readSmallFileAsDataUrl(file, maxLength = MAX_DATA_URL_LENGTH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (dataUrl.length > maxLength) {
        reject(new Error(`This file is too large to attach (PDFs can't be compressed the way a photo can). Try a photo of just the cost lines instead, or a shorter/lower-resolution scan.`));
        return;
      }
      resolve(dataUrl);
    };
    reader.readAsDataURL(file);
  });
}
