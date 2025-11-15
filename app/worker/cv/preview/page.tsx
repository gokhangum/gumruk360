
import WorkerCvPreview from "@/components/worker-cv/Preview";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {

const t = await getTranslations();

return {
	title: `${t("ask.cvPreview.title")} | ${t("nav.worker")}`,
	};

}

export default function Page() {
  return <WorkerCvPreview />;
}
