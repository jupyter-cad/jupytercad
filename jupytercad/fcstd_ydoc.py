from typing import Any, Callable
from functools import partial

import y_py as Y
from jupyter_ydoc.ybasedoc import YBaseDoc

from jupytercad.freecad.loader import FCStd


class YFCStd(YBaseDoc):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._ysource = self._ydoc.get_text('source')
        self._yobjects = self._ydoc.get_array('objects')
        self._yoptions = self._ydoc.get_map('options')
        self._ymeta = self._ydoc.get_map('metadata')
        self._virtual_file = FCStd()

    @property
    def objects(self) -> Y.YArray:
        return self._yobjects

    def get(self):
        fc_objects = self._yobjects.to_json()
        options = self._yoptions.to_json()
        meta = self._ymeta.to_json()
        self._virtual_file.save(fc_objects, options, meta)
        return self._virtual_file.sources

    def set(self, value):
        virtual_file = self._virtual_file
        virtual_file.load(value)
        objects = []

        for obj in virtual_file.objects:
            objects.append(Y.YMap(obj))
        with self._ydoc.begin_transaction() as t:
            length = len(self._yobjects)
            self._yobjects.delete_range(t, 0, length)
            self._yobjects.extend(t, objects)
            self._yoptions.update(t, virtual_file.options.items())
            self._ymeta.update(t, virtual_file.metadata.items())

    def observe(self, callback: Callable[[str, Any], None]):
        self.unobserve()
        self._subscriptions[self._ystate] = self._ystate.observe(partial(callback, "state"))
        self._subscriptions[self._ysource] = self._ysource.observe(partial(callback, "source"))
        self._subscriptions[self._yobjects] = self._yobjects.observe_deep(
            partial(callback, "objects")
        )
        self._subscriptions[self._yoptions] = self._yoptions.observe(partial(callback, "options"))
        self._subscriptions[self._ymeta] = self._ymeta.observe_deep(partial(callback, "meta"))
