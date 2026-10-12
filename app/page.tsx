import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/hooks/useI18n";

export default function Home() {
  return (
    <Suspense>
      <I18nProvider>
        <AppShell serverCwd={process.cwd()} />
      </I18nProvider>
    </Suspense>
  );
}
