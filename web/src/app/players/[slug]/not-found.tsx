import { NotFoundBody } from "@/components/Loading";

export default function NotFound() {
  return (
    <NotFoundBody what="Player" back="/players" backLabel="Search all players">
      <p>
        There is no player with this id in the current Cricsheet build. Player ids combine the name with the Cricsheet person id, for example{" "}
        <code className="whitespace-nowrap font-mono">v-kohli-ba607b88</code>.
      </p>
    </NotFoundBody>
  );
}
