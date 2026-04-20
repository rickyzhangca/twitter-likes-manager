/* eslint-disable react-refresh/only-export-components */

import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/services")({
	component: ServicesPage,
});

function ServicesPage() {
	return <Navigate to="/overview" />;
}
