import type { CSSProperties } from "react";

interface AppToolbarProps {
	title: string;
	context: string;
	sidebarWidth: number;
}

export function AppToolbar({ title, context, sidebarWidth }: AppToolbarProps) {
	const style = {
		"--lb-sidebar-width": `${sidebarWidth}px`,
	} as CSSProperties;

	return (
		<header className="lb-toolbar-shell lb-drag-region" style={style}>
			<div className="lb-toolbar-sidebar-spacer" />
			<div className="lb-toolbar-divider" />

			<div className="lb-toolbar lb-no-drag-region">
				<div className="lb-toolbar-left">
					<h1 className="lb-toolbar-title">{title}</h1>
					{context ? (
						<span className="lb-toolbar-context">{context}</span>
					) : null}
					<button
						type="button"
						className="lb-toolbar-ellipsis-btn"
						aria-label="More thread actions"
					>
						⋯
					</button>
				</div>

				<div className="lb-toolbar-right">
					<button
						type="button"
						className="lb-toolbar-icon-btn"
						aria-label="Run"
					>
						<span className="lb-icon-triangle" />
					</button>
					<button
						type="button"
						className="lb-toolbar-btn"
						aria-label="Open menu"
					>
						<span className="lb-toolbar-btn-dot" /> Open
						<span className="lb-toolbar-chevron">▾</span>
					</button>
					<button
						type="button"
						className="lb-toolbar-btn"
						aria-label="Commit menu"
					>
						<span className="lb-toolbar-sliders" /> Commit
						<span className="lb-toolbar-chevron">▾</span>
					</button>
					<span className="lb-toolbar-separator" />
					<button
						type="button"
						className="lb-toolbar-icon-btn"
						aria-label="Panel"
					>
						<span className="lb-icon-square" />
					</button>
					<button
						type="button"
						className="lb-toolbar-icon-btn"
						aria-label="Diff view"
					>
						<span className="lb-icon-copy" />
					</button>
					<div className="lb-toolbar-metric" title="Metrics">
						<span className="is-positive">+15,754</span>
						<span className="is-negative">-6,863</span>
					</div>
				</div>
			</div>
		</header>
	);
}
