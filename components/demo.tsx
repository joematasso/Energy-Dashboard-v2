import { LoginPage } from "@/components/ui/sign-in-flow-1";

const LoginDemo = () => {
  const handleLogin = (email: string, password: string) => {
    console.log("Login attempt:", { email, password });
  };

  return (
    <div className="flex w-full h-screen justify-center items-center">
      <LoginPage onLogin={handleLogin} />
    </div>
  );
};

export { LoginDemo };
