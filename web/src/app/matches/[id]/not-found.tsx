import { NotFoundBody } from "@/components/Loading";

export default function MatchNotFound() {
  return (
    <NotFoundBody what="Match" back="/matches" backLabel="Browse every match">
      <p>There is no international with this id in the current Cricsheet build. Match ids are Cricsheet file numbers, for example 1384439.</p>
    </NotFoundBody>
  );
}
