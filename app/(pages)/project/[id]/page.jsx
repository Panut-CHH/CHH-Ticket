"use client";

import { use } from "react";
import UIProjectDetail from "@/modules/project/UIProjectDetail";

export default function ProjectDetailPage({ params }) {
  const resolvedParams = use(params);
  return <UIProjectDetail projectId={resolvedParams.id} />;
}
