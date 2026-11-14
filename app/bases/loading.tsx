import { OrbitLoader } from "@/components/motion/OrbitLoader";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <OrbitLoader label="Loading the Moon base map" />
    </div>
  );
}
