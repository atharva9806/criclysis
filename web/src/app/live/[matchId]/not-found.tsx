import { NotFoundBody } from "@/components/Loading";

export default function ReplayNotFound() {
  return (
    <NotFoundBody what="Replay" back="/live" backLabel="Browse results and replays">
      <p>
        Either the match is not in the current Cricsheet build, or Cricsheet has no ball-by-ball record for it. Replays exist only for matches with
        ball-by-ball data.
      </p>
    </NotFoundBody>
  );
}
