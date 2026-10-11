import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TitlesRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/opac/title/${id}`);
}
