import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Suspense } from "react";

export default function Home() {
  return (
    <div>
      <Suspense>
        <AuthButton/>
      <ThemeSwitcher/>
      </Suspense>
    </div>
  );
}
