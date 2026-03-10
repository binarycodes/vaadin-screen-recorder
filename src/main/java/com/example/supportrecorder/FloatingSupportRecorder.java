package com.example.supportrecorder;

import com.vaadin.flow.component.AbstractSinglePropertyField;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;

@Tag("floating-support-recorder")
@JsModule("./src/floating-support-recorder.ts")
public class FloatingSupportRecorder extends AbstractSinglePropertyField<FloatingSupportRecorder, String> {

    public FloatingSupportRecorder() {
        super("status", "idle", false);
    }

    public void start() {
        getElement().callJsFunction("start");
    }

    public void stop() {
        getElement().callJsFunction("stop");
    }

    public void download() {
        getElement().callJsFunction("download");
    }

    @ClientCallable
    private void setStatusFromClient(String status) {
        setModelValue(status, true);
    }
}
