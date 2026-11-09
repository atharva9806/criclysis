import { NotFoundBody } from "@/components/Loading";

export default function NotFound() {
  return (
    <NotFoundBody what="Team" back="/teams" backLabel="All teams">
      <p>
        There is no international side with this id in the current Cricsheet build. Team ids end in <code className="font-mono">-m</code> for men or{" "}
        <code className="font-mono">-w</code> for women, for example <code className="font-mono">india-m</code>.
      </p>
    </NotFoundBody>
  );
}
