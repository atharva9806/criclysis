import { NotFoundBody } from "@/components/Loading";

export default function NotFound() {
  return (
    <NotFoundBody what="Head to head" back="/teams" backLabel="All teams">
      <p>One of these teams is not in the current Cricsheet build, or the address is mistyped.</p>
    </NotFoundBody>
  );
}
