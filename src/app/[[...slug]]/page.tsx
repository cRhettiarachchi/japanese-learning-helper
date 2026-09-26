import fs from "node:fs";
import path from "node:path";
import { notFound, redirect } from "next/navigation";
import manifest from "../../generated/manifest.json";
import { StudyPage } from "../../components/study-page";
import { VocabularyPage } from "../../components/vocabulary-page";
import type { StudyDocument } from "../../lib/types";
const routes = manifest as Record<string, string>;
export function generateStaticParams() {
  return Object.keys(routes).map((route) => ({
    slug: route === "/" ? [] : route.slice(1).split("/"),
  }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const name = routes["/" + (slug || []).join("/")];
  if (!name) return {};
  return {
    title:
      name === "vocabulary"
        ? "Vocabulary · Japanese learner"
        : JSON.parse(
            fs.readFileSync(
              path.join(process.cwd(), "src/generated", name),
              "utf8",
            ),
          ).title,
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const route = "/" + (slug || []).join("/");
  if (route === "/revisions.html" || route.startsWith("/revisions/"))
    redirect("/grammar.html");
  const name = routes[route];
  if (!name) notFound();
  if (name === "vocabulary") return <VocabularyPage />;
  const doc: StudyDocument = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "src/generated", name), "utf8"),
  );
  return <StudyPage key={route} doc={doc} />;
}
