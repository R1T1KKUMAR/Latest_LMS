import { redirect } from "next/navigation";

export default async function NoDuesCertificateRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/no-dues/certificate/${id}`);
}
