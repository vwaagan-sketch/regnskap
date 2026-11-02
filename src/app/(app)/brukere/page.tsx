import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listInvitations, listMembers } from "@/db/user-repo";
import UsersView from "./users-view";

export default async function BrukerePage() {
  const { sql, company, user } = await requireContext("admin");
  const [members, invitations] = await Promise.all([listMembers(sql, company.id), listInvitations(sql, company.id)]);
  return (
    <>
      <PageHeader
        title="Brukere"
        description={`Hvem som har tilgang til ${company.name}, og hva de kan gjøre.`}
      />
      <UsersView members={members} invitations={invitations} currentUserId={user.id} />
    </>
  );
}
