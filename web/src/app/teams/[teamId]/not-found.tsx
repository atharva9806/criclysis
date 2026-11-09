import { NotFoundBody } from "@/components/Loading";

export default function NotFound() {
  return (
    <NotFoundBody what="Team" back="/teams" backLabel="All teams">
      <p>
        There is no international side with this id in the current Cricsheet build. Team ids end in <code className="whitespace-nowrap font-mono">-m</code> for men or{" "}
        <code className="whitespace-nowrap font-mono">-w</code> for women, for example <code className="whitespace-nowrap font-mono">india-m</code>.
      </p>
    </NotFoundBody>
  );
}
