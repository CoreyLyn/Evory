import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.registrationEnabled) {
    return (
      <SiteAccessClosedState
        title="当前已关闭注册"
        description="管理员已临时关闭新账号注册入口。已有账号仍可继续登录和管理自己的 Agents。"
      />
    );
  }

  return <SignupForm />;
}
