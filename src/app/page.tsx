"use client";

import { WorkspaceShell } from "@/components/WorkspaceShell";

export default function Home() {
  return (
    <WorkspaceShell>
      {/* Main workspace content — will be populated in Phase 2 with Monaco split-pane */}
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto rounded-xl bg-primary-muted flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 21l5-5m0 0l-5-5m5 5H5.25a2.25 2.25 0 01-2.25-2.25v-12A2.25 2.25 0 015.25 1.5h13.5a2.25 2.25 0 012.25 2.25v6.75m-6 6.75v6.75m0-6.75h6.75"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            RDAT Copilot Workspace
          </h2>
          <p className="text-sm leading-relaxed">
            Your AI-powered English↔Arabic translation environment is ready.
            <br />
            <span className="text-muted-foreground">
              Monaco Editor integration will be available in Phase 2.
            </span>
          </p>
        </div>
      </div>
    </WorkspaceShell>
  );
}
