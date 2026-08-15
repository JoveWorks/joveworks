Input nodes' boxes are not big enough. The output port is not on the side but in the middle.

When the node folds open on hover, I want everything to stay in place and extend the node down with the aditional information. Now it just resizes the node and all contents shift.

Nodes need a delete button, maybe some other buttons too?

Right click menu is not used.

Section frames cannot be resized

Sections should be able to be reordered in the notebook view by dragging

The `value` label for outputs is a misnomer. Maybe we should split it into: `print`, `plot`. The check output is already extracted. These nodes should also be in the catalogue in the first section, before base nodes (also the + section button)

Messages should be overlayed instead of pushing all other elements down on the screen.

There is not enough use of color. Maybe we should tint the input, calc, output nodes differently?

UI elements should be able to be 'collapsed'. e.g. catalogues, notebook sections,

Backspace is the deletion shortcut, why not delete or both?

Hovering over a node does not put it on the foreground.

I want to be able to edit input nodes in the main screen, not the one that appears on hover. This will help quick iterations. The kind (list, value, range) does not need to be readily changeable, only the bounds/contents/values.

Catalogues are not stored in local storage. To update a catalogue, the used can just load it again, webapp checks version and updates.

Notebook and catalogue panels cannot be resized, especially important to be able to resize the notebook.

Some units are expanded too much. e.g. W becomes Nmm/s in a multiply node. We need a better system to choose appropriate units, or let the user override in the dropdown on hover.

Some nodes (e.g. rm.16.29) does not show the port names when not expanded.

Variable names are not correctly styled. F_a should have a in subscript. beta and epsilon and others should be proper greek letters.

In general, the font of the UI (not nodes) is too small. Maybe we should parametrize this and the colours so I can change this easy? Also, we need dark mode duh.

Output ports do not match the correct line of the value in the node box. This will be very important when we add multi output nodes.

We will need to talk about the plot node. I am missing a lot of options to add multiple series for instance, or to indicate some values. This is a big feature, so we will do this in a separate session after MVP. Add to backlog.

I need to be able to add images to the notebooks too.

I got this error on connecting a node:

```
Uncaught KernelError: a series carries an axis the target grid does not
    KernelError errors.ts:18
    indexer series.ts:136
    rows PlotFigure.tsx:49
    PlotFigure PlotFigure.tsx:75
    React 41
        react_stack_bottom_frame
        runWithFiberInDEV
        commitHookEffectListMount
        commitHookPassiveMountEffects
        reconnectPassiveEffects
        recursivelyTraverseReconnectPassiveEffects
        reconnectPassiveEffects
        recursivelyTraverseReconnectPassiveEffects
        reconnectPassiveEffects
        doubleInvokeEffectsOnFiber
        runWithFiberInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        recursivelyTraverseAndDoubleInvokeEffectsInDEV
        commitDoubleInvokeEffectsInDEV
        flushPassiveEffects
        flushPendingEffects
        flushSpawnedWork
        commitRoot
        commitRootWhenReady
        performWorkOnRoot
        performSyncWorkOnRoot
        flushSyncWorkAcrossRoots_impl
        processRootScheduleInMicrotask
        dom
errors.ts:18:5
```
