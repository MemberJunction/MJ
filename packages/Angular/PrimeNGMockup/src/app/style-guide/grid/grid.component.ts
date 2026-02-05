import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface AlignOption {
    class: string;
    label: string;
}

@Component({
    selector: 'app-grid',
    standalone: true,
    imports: [CommonModule],
    template: `
    <!-- ======================================== -->
    <!-- SECTION 1: 12-Column Grid                -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>12-Column Grid</h2>
        <p class="section-desc">
            The <code>.mj-grid</code> container with <code>.mj-col-N</code> children produces a
            mobile-first 12-column flexbox layout backed by MJ design tokens.
        </p>

        <div class="demo-block">
            <h4>Individual Column Widths</h4>
            <div class="demo-surface">
                @for (col of Columns; track col) {
                    <div class="mj-grid mj-gap-1" style="margin-bottom: 4px">
                        <div [class]="'mj-col-' + col">
                            <div class="cell">mj-col-{{ col }}</div>
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Multi-Column Combos</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2" style="margin-bottom: 8px">
                    <div class="mj-col-6"><div class="cell">6</div></div>
                    <div class="mj-col-6"><div class="cell cell-accent">6</div></div>
                </div>
                <div class="mj-grid mj-gap-2" style="margin-bottom: 8px">
                    <div class="mj-col-4"><div class="cell">4</div></div>
                    <div class="mj-col-4"><div class="cell cell-accent">4</div></div>
                    <div class="mj-col-4"><div class="cell cell-tertiary">4</div></div>
                </div>
                <div class="mj-grid mj-gap-2" style="margin-bottom: 8px">
                    <div class="mj-col-3"><div class="cell">3</div></div>
                    <div class="mj-col-6"><div class="cell cell-accent">6</div></div>
                    <div class="mj-col-3"><div class="cell cell-tertiary">3</div></div>
                </div>
                <div class="mj-grid mj-gap-2">
                    <div class="mj-col-2"><div class="cell">2</div></div>
                    <div class="mj-col-8"><div class="cell cell-accent">8</div></div>
                    <div class="mj-col-2"><div class="cell cell-tertiary">2</div></div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 2: Responsive Columns            -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Responsive Columns</h2>
        <p class="section-desc">
            Breakpoint-prefixed classes like <code>.mj-col-md-6</code> apply from that breakpoint up.
            Resize your browser to see columns reflow.
        </p>

        <div class="demo-block">
            <h4>Auto-Responsive Cards</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-3">
                    @for (i of [1,2,3,4]; track i) {
                        <div class="mj-col-md-6 mj-col-lg-4 mj-col-xl-3">
                            <div class="cell">col-12 / md-6 / lg-4 / xl-3</div>
                        </div>
                    }
                </div>
            </div>
        </div>

        <div class="demo-block">
            <h4>Sidebar + Main Layout</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-3">
                    <div class="mj-col-md-4 mj-col-lg-3">
                        <div class="cell cell-accent" style="min-height: 120px">Sidebar</div>
                    </div>
                    <div class="mj-col-md-8 mj-col-lg-9">
                        <div class="cell" style="min-height: 120px">Main Content</div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 3: Auto & Fixed Columns          -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Auto &amp; Fixed Columns</h2>
        <p class="section-desc">
            <code>.mj-col</code> grows to fill remaining space.
            <code>.mj-col-fixed</code> sizes to its content.
        </p>

        <div class="demo-block">
            <h4>Auto-Grow Columns</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    <div class="mj-col"><div class="cell">auto</div></div>
                    <div class="mj-col"><div class="cell cell-accent">auto</div></div>
                    <div class="mj-col"><div class="cell cell-tertiary">auto</div></div>
                </div>
            </div>
        </div>

        <div class="demo-block">
            <h4>Fixed + Auto</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    <div class="mj-col-fixed">
                        <div class="cell cell-accent" style="width: 200px">fixed 200px</div>
                    </div>
                    <div class="mj-col">
                        <div class="cell">auto (fills remaining)</div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 4: Gap Utilities                 -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Gap Utilities</h2>
        <p class="section-desc">
            <code>.mj-gap-N</code> sets both row and column gap.
            <code>.mj-row-gap-N</code> and <code>.mj-col-gap-N</code> control each axis independently.
        </p>

        <div class="demo-block">
            <h4>Comparing Gap Sizes</h4>
            <div class="mj-grid mj-gap-4">
                @for (gap of GapSizes; track gap) {
                    <div class="mj-col-md-6 mj-col-lg-4 demo-surface">
                        <div class="demo-label">mj-gap-{{ gap }}</div>
                        <div [class]="'mj-grid mj-gap-' + gap">
                            <div class="mj-col-4"><div class="cell">1</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">2</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">3</div></div>
                            <div class="mj-col-4"><div class="cell">4</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">5</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">6</div></div>
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Independent Row Gap vs Column Gap</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-6">
                    <div class="mj-col" style="min-width: 250px">
                        <div class="demo-label">mj-row-gap-4 mj-col-gap-1</div>
                        <div class="mj-grid mj-row-gap-4 mj-col-gap-1">
                            <div class="mj-col-4"><div class="cell">1</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">2</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">3</div></div>
                            <div class="mj-col-4"><div class="cell">4</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">5</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">6</div></div>
                        </div>
                    </div>
                    <div class="mj-col" style="min-width: 250px">
                        <div class="demo-label">mj-row-gap-1 mj-col-gap-4</div>
                        <div class="mj-grid mj-row-gap-1 mj-col-gap-4">
                            <div class="mj-col-4"><div class="cell">1</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">2</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">3</div></div>
                            <div class="mj-col-4"><div class="cell">4</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent">5</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">6</div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 5: Alignment                     -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Alignment</h2>
        <p class="section-desc">
            <code>.mj-align-*</code> controls cross-axis alignment (align-items).
            <code>.mj-justify-*</code> controls main-axis distribution (justify-content).
        </p>

        <div class="demo-block">
            <h4>Align Items</h4>
            <div class="mj-grid mj-gap-4">
                @for (opt of AlignOptions; track opt.class) {
                    <div class="mj-col-md-6 mj-col-lg-4 demo-surface">
                        <div class="demo-label">{{ opt.class }}</div>
                        <div [class]="'mj-grid mj-gap-2 ' + opt.class" style="min-height: 100px">
                            <div class="mj-col-4"><div class="cell cell-tall">tall</div></div>
                            <div class="mj-col-4"><div class="cell cell-accent cell-short">short</div></div>
                            <div class="mj-col-4"><div class="cell cell-tertiary">med</div></div>
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Justify Content</h4>
            <div class="mj-grid mj-gap-4">
                @for (opt of JustifyOptions; track opt.class) {
                    <div class="mj-col-md-6 mj-col-lg-4 demo-surface">
                        <div class="demo-label">{{ opt.class }}</div>
                        <div [class]="'mj-grid ' + opt.class" style="min-height: 48px">
                            <div class="mj-col-2"><div class="cell">A</div></div>
                            <div class="mj-col-2"><div class="cell cell-accent">B</div></div>
                            <div class="mj-col-2"><div class="cell cell-tertiary">C</div></div>
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Align Self</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2 mj-align-stretch" style="min-height: 120px">
                    <div class="mj-col mj-self-start"><div class="cell">self-start</div></div>
                    <div class="mj-col mj-self-center"><div class="cell cell-accent">self-center</div></div>
                    <div class="mj-col mj-self-end"><div class="cell cell-tertiary">self-end</div></div>
                    <div class="mj-col mj-self-stretch"><div class="cell" style="height: 100%">self-stretch</div></div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 6: Offsets                       -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Offsets</h2>
        <p class="section-desc">
            <code>.mj-offset-N</code> pushes a column to the right by N of 12 columns.
        </p>

        <div class="demo-block">
            <h4>Stacked Offsets</h4>
            <div class="demo-surface">
                @for (off of [0,1,2,3,4,5,6]; track off) {
                    <div class="mj-grid mj-gap-1" style="margin-bottom: 4px">
                        <div [class]="'mj-col-4 mj-offset-' + off">
                            <div class="cell">offset-{{ off }}</div>
                        </div>
                    </div>
                }
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 7: Flex Direction                -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Flex Direction</h2>
        <p class="section-desc">
            <code>.mj-flex-row</code>, <code>.mj-flex-row-reverse</code>,
            <code>.mj-flex-column</code>, <code>.mj-flex-column-reverse</code>
            change the main axis of <code>.mj-grid</code>.
        </p>

        <div class="demo-block">
            <h4>Direction Variants</h4>
            <div class="mj-grid mj-gap-4">
                @for (dir of ['mj-flex-row','mj-flex-row-reverse','mj-flex-column','mj-flex-column-reverse']; track dir) {
                    <div class="mj-col-md-6 mj-col-lg-4 demo-surface">
                        <div class="demo-label">{{ dir }}</div>
                        <div [class]="'mj-grid mj-gap-2 ' + dir">
                            <div><div class="cell">1</div></div>
                            <div><div class="cell cell-accent">2</div></div>
                            <div><div class="cell cell-tertiary">3</div></div>
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Flex Grow &amp; Shrink</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    <div class="mj-flex-grow-0"><div class="cell" style="width: 120px">grow-0 (120px)</div></div>
                    <div class="mj-flex-grow-1"><div class="cell cell-accent">grow-1 (fills)</div></div>
                    <div class="mj-flex-grow-0"><div class="cell cell-tertiary" style="width: 120px">grow-0 (120px)</div></div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- SECTION 8: Visibility                    -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>Visibility</h2>
        <p class="section-desc">
            <code>.mj-hidden-sm</code> hides at <code>sm</code> and above.
            Combine <code>.mj-hidden</code> + <code>.mj-visible-md</code> to show only from <code>md</code> up.
            Resize to see elements toggle.
        </p>

        <div class="demo-block">
            <h4>Hidden at Breakpoint</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    <div class="mj-col"><div class="cell">Always visible</div></div>
                    <div class="mj-col mj-hidden-sm"><div class="cell cell-accent">Hidden sm+</div></div>
                    <div class="mj-col mj-hidden-md"><div class="cell cell-tertiary">Hidden md+</div></div>
                    <div class="mj-col mj-hidden-lg"><div class="cell">Hidden lg+</div></div>
                    <div class="mj-col mj-hidden-xl"><div class="cell cell-accent">Hidden xl+</div></div>
                </div>
            </div>
        </div>

        <div class="demo-block">
            <h4>Visible from Breakpoint</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    <div class="mj-col"><div class="cell">Always visible</div></div>
                    <div class="mj-col mj-hidden mj-visible-sm"><div class="cell cell-accent">Visible sm+</div></div>
                    <div class="mj-col mj-hidden mj-visible-md"><div class="cell cell-tertiary">Visible md+</div></div>
                    <div class="mj-col mj-hidden mj-visible-lg"><div class="cell">Visible lg+</div></div>
                    <div class="mj-col mj-hidden mj-visible-xl"><div class="cell cell-accent">Visible xl+</div></div>
                </div>
            </div>
        </div>

        <div class="demo-block">
            <h4>Breakpoint Reference</h4>
            <div class="demo-surface">
                <div class="mj-grid mj-gap-2">
                    @for (bp of [
                        { name: 'sm', value: '576px' },
                        { name: 'md', value: '768px' },
                        { name: 'lg', value: '992px' },
                        { name: 'xl', value: '1200px' },
                        { name: '2xl', value: '1400px' }
                    ]; track bp.name) {
                        <div class="mj-col-sm-6 mj-col-md-4 mj-col-lg-2">
                            <div class="visibility-badge">
                                <strong>{{ bp.name }}</strong>
                                <span>{{ bp.value }}</span>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- CSS GRID: Stepped Columns (mj-row)       -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>CSS Grid: Stepped Columns</h2>
        <p class="section-desc">
            <code>.mj-row</code> uses CSS Grid with <code>.mj-row-cols-N</code> to create equal-width
            columns. Children don't need individual column classes &mdash; the parent controls the count.
            Responsive variants like <code>.mj-row-cols-md-2</code> adjust columns at breakpoints.
        </p>

        <div class="demo-block">
            <h4>Fixed Column Counts</h4>
            <div class="mj-grid mj-flex-column mj-gap-4">
                @for (cols of [2, 3, 4, 6]; track cols) {
                    <div class="demo-surface">
                        <div class="demo-label">mj-row-cols-{{ cols }}</div>
                        <div [class]="'mj-row mj-row-cols-' + cols + ' mj-gap-2'">
                            @for (i of CSSGridItems; track i) {
                                <div><div class="cell">{{ i }}</div></div>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>

        <div class="demo-block">
            <h4>Responsive Column Counts</h4>
            <div class="demo-surface">
                <div class="demo-label">mj-row-cols-1 mj-row-cols-sm-2 mj-row-cols-md-3 mj-row-cols-lg-4</div>
                <div class="mj-row mj-row-cols-1 mj-row-cols-sm-2 mj-row-cols-md-3 mj-row-cols-lg-4 mj-gap-3">
                    @for (i of CSSGridItems; track i) {
                        <div><div class="cell cell-accent">Item {{ i }}</div></div>
                    }
                </div>
            </div>
        </div>

        <div class="demo-block">
            <h4>Common Patterns</h4>
            <div class="mj-grid mj-flex-column mj-gap-4">
                <div class="demo-surface">
                    <div class="demo-label">Card grid: mj-row-cols-md-2 mj-row-cols-lg-3</div>
                    <div class="mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-3">
                        @for (i of [1,2,3,4,5,6]; track i) {
                            <div><div class="cell">Card {{ i }}</div></div>
                        }
                    </div>
                </div>
                <div class="demo-surface">
                    <div class="demo-label">Icon grid: mj-row-cols-3 mj-row-cols-sm-4 mj-row-cols-md-6</div>
                    <div class="mj-row mj-row-cols-3 mj-row-cols-sm-4 mj-row-cols-md-6 mj-gap-2">
                        @for (i of CSSGridItems; track i) {
                            <div><div class="cell cell-tertiary">{{ i }}</div></div>
                        }
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- CSS GRID: Fluid Auto-Fill (mj-row-auto)  -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>CSS Grid: Fluid Auto-Fill</h2>
        <p class="section-desc">
            <code>.mj-row-auto</code> with <code>.mj-row-min-*</code> uses
            <code>auto-fill</code> and <code>minmax()</code> to create a fluid grid that
            automatically wraps items based on available space. No breakpoints needed.
        </p>

        <div class="demo-block">
            <h4>Minimum Size Variants</h4>
            <div class="mj-grid mj-flex-column mj-gap-4">
                @for (size of ['xs', 'sm', 'md', 'lg', 'xl']; track size) {
                    <div class="demo-surface">
                        <div class="demo-label">mj-row-auto mj-row-min-{{ size }}</div>
                        <div [class]="'mj-row-auto mj-row-min-' + size + ' mj-gap-2'">
                            @for (i of CSSGridItems; track i) {
                                <div><div class="cell">{{ i }}</div></div>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    </section>

    <!-- ======================================== -->
    <!-- CSS GRID: Container Queries              -->
    <!-- ======================================== -->
    <section class="demo-section">
        <h2>CSS Grid: Container Queries</h2>
        <p class="section-desc">
            Children of <code>.mj-row</code> and <code>.mj-row-auto</code> automatically
            get <code>container-type: inline-size</code>, enabling component-level responsive
            design with <code>&#64;container</code> queries instead of viewport-based
            <code>&#64;media</code> queries.
        </p>

        <div class="demo-block">
            <h4>Cards in Different Column Counts</h4>
            <div class="demo-surface">
                <div class="demo-label">mj-row-cols-2 &mdash; children are narrow containers</div>
                <div class="mj-row mj-row-cols-2 mj-gap-3">
                    @for (i of [1, 2]; track i) {
                        <div class="container-demo-card">
                            <div class="cell">Container child {{ i }}</div>
                            <div class="container-info">Each child has container-type: inline-size</div>
                        </div>
                    }
                </div>
            </div>
            <div class="demo-surface" style="margin-top: var(--mj-space-4)">
                <div class="demo-label">mj-row-cols-4 &mdash; children are even narrower</div>
                <div class="mj-row mj-row-cols-4 mj-gap-3">
                    @for (i of [1, 2, 3, 4]; track i) {
                        <div class="container-demo-card">
                            <div class="cell cell-accent">Container child {{ i }}</div>
                            <div class="container-info">container-type: inline-size</div>
                        </div>
                    }
                </div>
            </div>
        </div>
    </section>
    `,
    styles: [`
    /* ========================================
       Section Structure (matches existing components)
       ======================================== */
    :host {
        display: block;
    }

    .demo-section {
        margin-bottom: var(--mj-space-10);
    }

    .demo-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .section-desc code {
        background: var(--mj-bg-surface-sunken);
        padding: 2px 6px;
        border-radius: var(--mj-radius-sm);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
    }

    .demo-block {
        margin-bottom: var(--mj-space-6);
    }

    .demo-block h4 {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-secondary);
        margin: 0 0 var(--mj-space-3) 0;
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
    }

    /* ========================================
       Demo Surface & Labels
       ======================================== */
    .demo-surface {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4);
    }

    .demo-label {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        margin-bottom: var(--mj-space-2);
    }

    /* ========================================
       Demo Cells (colored boxes for grid items)
       ======================================== */
    .cell {
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
        border-radius: var(--mj-radius-sm);
        padding: var(--mj-space-2) var(--mj-space-3);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .cell-accent {
        background: color-mix(in srgb, var(--mj-brand-accent) 15%, transparent);
        border-color: color-mix(in srgb, var(--mj-brand-accent) 30%, transparent);
    }

    .cell-tertiary {
        background: color-mix(in srgb, var(--mj-brand-tertiary) 12%, transparent);
        border-color: color-mix(in srgb, var(--mj-brand-tertiary) 25%, transparent);
    }

    .cell-tall {
        padding-top: var(--mj-space-6);
        padding-bottom: var(--mj-space-6);
    }

    .cell-short {
        padding-top: var(--mj-space-1);
        padding-bottom: var(--mj-space-1);
    }

    /* ========================================
       Visibility Badge
       ======================================== */
    .visibility-badge {
        background: var(--mj-status-info-bg);
        border: 1px solid var(--mj-status-info-border);
        border-radius: var(--mj-radius-md);
        padding: var(--mj-space-3);
        text-align: center;
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-sm);
        color: var(--mj-status-info-text);
    }

    .visibility-badge strong {
        display: block;
        font-size: var(--mj-text-lg);
        margin-bottom: var(--mj-space-1);
    }

    .visibility-badge span {
        font-size: var(--mj-text-xs);
        opacity: 0.8;
    }

    /* ========================================
       Container Query Demo
       ======================================== */
    .container-demo-card {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        padding: var(--mj-space-3);
    }

    .container-info {
        font-family: var(--mj-font-family-mono);
        font-size: 10px;
        color: var(--mj-text-muted);
        margin-top: var(--mj-space-2);
    }
    `]
})
export class GridComponent {
    GapSizes = [0, 1, 2, 3, 4, 5, 6, 8];
    Columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    CSSGridItems = [1, 2, 3, 4, 5, 6, 7, 8];
    AlignOptions: AlignOption[] = [
        { class: 'mj-align-start', label: 'start' },
        { class: 'mj-align-center', label: 'center' },
        { class: 'mj-align-end', label: 'end' },
        { class: 'mj-align-stretch', label: 'stretch' },
        { class: 'mj-align-baseline', label: 'baseline' }
    ];
    JustifyOptions: AlignOption[] = [
        { class: 'mj-justify-start', label: 'start' },
        { class: 'mj-justify-center', label: 'center' },
        { class: 'mj-justify-end', label: 'end' },
        { class: 'mj-justify-between', label: 'between' },
        { class: 'mj-justify-around', label: 'around' },
        { class: 'mj-justify-evenly', label: 'evenly' }
    ];
}
