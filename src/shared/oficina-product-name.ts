import { OFICINA_IDENTITY } from './oficina-identity'

// Why: shipped copy and every locale catalog carry the upstream name. The fork renames the few labels it
// shows for the app itself here, instead of editing catalogs and diverging from upstream's translations.
// "Orca Mobile" stays: the phone app is still Orca's.
export function withProductName(text: string): string {
  const { productName } = OFICINA_IDENTITY
  return productName === 'Orca' ? text : text.replace(/\bOrca\b(?! Mobile)/g, productName)
}
