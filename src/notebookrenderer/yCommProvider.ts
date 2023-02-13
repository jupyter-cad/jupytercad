import { IComm } from '@jupyterlab/services/lib/kernel/kernel';
import { ICommMsgMsg } from '@jupyterlab/services/lib/kernel/messages';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export enum YMessageType {
  SYNC = 0,
  AWARENESS = 1
}
export class YCommProvider {
  constructor(options: { comm: IComm; ydoc: Y.Doc }) {
    this._comm = options.comm;
    this._ydoc = options.ydoc;
    this._ydoc.on('update', this._updateHandler);
    this._connect();
  }

  get doc(): Y.Doc {
    return this._ydoc;
  }
  get synced(): boolean {
    return this._synced;
  }

  set synced(state: boolean) {
    if (this._synced !== state) {
      this._synced = state;
    }
  }

  private _onMsg = (msg: ICommMsgMsg<'iopub' | 'shell'>) => {
    if (msg.buffers) {
      const buffer = msg.buffers[0] as ArrayBuffer;
      const encoder = Private.readMessage(this, new Uint8Array(buffer), true);
      if (encoding.length(encoder) > 1) {
        this._sendOverComm(encoding.toUint8Array(encoder));
      }
    }
  };

  private _updateHandler = (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YMessageType.SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this._sendOverComm(encoding.toUint8Array(encoder));
  };

  private _connect() {
    this._sync();
    this._comm.onMsg = this._onMsg;
  }

  private _sync(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YMessageType.SYNC);
    syncProtocol.writeSyncStep1(encoder, this._ydoc);
    this._sendOverComm(encoding.toUint8Array(encoder));
  }

  private _sendOverComm(bufferArray: Uint8Array) {
    this._comm.send({}, undefined, [bufferArray.buffer]);
  }

  private _comm: IComm;
  private _ydoc: Y.Doc;
  private _synced: boolean;
}

namespace Private {
  export function syncMessageHandler(
    encoder: encoding.Encoder,
    decoder: decoding.Decoder,
    provider: YCommProvider,
    emitSynced: boolean
  ): void {
    encoding.writeVarUint(encoder, YMessageType.SYNC);
    const syncMessageType = syncProtocol.readSyncMessage(
      decoder,
      encoder,
      provider.doc,
      provider
    );
    if (
      emitSynced &&
      syncMessageType === syncProtocol.messageYjsSyncStep2 &&
      !provider.synced
    ) {
      syncProtocol.writeSyncStep2(encoder, provider.doc);
      provider.synced = true;
    }
  }
  export function readMessage(
    provider: YCommProvider,
    buf: Uint8Array,
    emitSynced: boolean
  ): encoding.Encoder {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    if (messageType === YMessageType.SYNC) {
      syncMessageHandler(encoder, decoder, provider, emitSynced);
    } else {
      console.error('Unable to compute message');
    }
    return encoder;
  }
}
