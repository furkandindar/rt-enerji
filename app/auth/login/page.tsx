import { LoginForm } from "@/components/login-form";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-slate-50 dark:bg-radial-[at_50%_50%] dark:from-slate-900 dark:via-slate-950 dark:to-black p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
