import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Router-cachen återanvänder besökta vyer i 30 s – navigering känns
    // omedelbar. Mutationer kör revalidatePath/router.refresh, så ändrade
    // vyer uppdateras ändå direkt.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
