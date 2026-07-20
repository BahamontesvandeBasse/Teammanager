// Korte, plakbare toegangscode voor het mobiele spelersscherm (geen wachtwoord-sterkte nodig:
// gesloten team, niet-gevoelige data — puur bedoeld om drempelloos te delen via WhatsApp).
export function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}
