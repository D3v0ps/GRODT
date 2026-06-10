/** Läser en obligatorisk miljövariabel med tydligt fel om den saknas. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Miljövariabeln ${name} saknas. Se .env.example för samtliga variabler.`,
    );
  }
  return value;
}
