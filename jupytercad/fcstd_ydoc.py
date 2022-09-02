import json
from jupyter_ydoc.ydoc import YBaseDoc
import y_py as Y

from jupytercad.freecad.loader import FCStd


class YFCStd(YBaseDoc):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        print('######', args, kwargs)
        self._ysource = self._ydoc.get_text('source')
        self._yobjects = self._ydoc.get_array('objects')
        self._yoptions = self._ydoc.get_map('options')
        self._virtual_file = FCStd()
    @property
    def source(self):
        objects = self._yobjects.to_json()
        options = self._yoptions.to_json()
        return json.dumps(dict(objects=objects, options=options), indent=2)

    @source.setter
    def source(self, value):
        print('value', len(value))
        self._virtual_file.load(value)
        valueDict = {
            'objects': [
                {
                    'shape': 'Box',
                    'visible': True,
                    'id': '123456',
                    'parameters': {
                        'x': 7.0,
                        'z': 19.0,
                        'center': [0.0, 0.0, 0.0],
                        'y': 15.0,
                    },
                }
            ],
            'options': {'foo': 1},
        }
        newObj = []
        for obj in valueDict['objects']:
            newObj.append(Y.YMap(obj))
        with self._ydoc.begin_transaction() as t:
            length = len(self._yobjects)
            self._yobjects.delete_range(t, 0, length)

            self._yobjects.extend(t, newObj)
            self._yoptions.update(t, valueDict['options'].items())

    def observe(self, callback):
        self.unobserve()
        self._subscriptions[self._ystate] = self._ystate.observe(callback)
        self._subscriptions[self._ysource] = self._ysource.observe(callback)
        self._subscriptions[self._yobjects] = self._yobjects.observe_deep(
            callback
        )
        self._subscriptions[self._yoptions] = self._yoptions.observe(callback)
