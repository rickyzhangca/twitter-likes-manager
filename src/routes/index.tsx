import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/home", search: { page: 1 } });
	},
	component: () => null,
});
