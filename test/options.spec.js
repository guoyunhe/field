/* eslint-disable react/jsx-filename-extension */
/* eslint-disable react/no-multi-comp */
import React from 'react';
import Enzyme, { mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import assert from 'power-assert';
import { Input } from '@alifd/next';
import { spy } from 'sinon';
import Field from '../src';

Enzyme.configure({ adapter: new Adapter() });

/*global describe it afterEach */
describe('options', () => {
    let wrapper;
    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
            wrapper = null;
        }
    });
    it('should support autoUnmount', function(done) {
        class Demo extends React.Component {
            state = {
                show: true,
            };
            field = new Field(this);

            render() {
                const init = this.field.init;
                return (
                    <div>
                        <Input {...init('input')} /> {this.state.show ? <Input {...init('input2')} /> : null}
                        <button
                            onClick={() => {
                                assert('input2' in this.field.getValues() === false);
                                done();
                            }}
                        >
                            click
                        </button>
                    </div>
                );
            }
        }
        wrapper = mount(<Demo />);
        wrapper.setState({ show: false });
        wrapper.update();
        wrapper.find('button').simulate('click');
    });

    it('should support autoUnmount with same name', function(done) {
        class Demo extends React.Component {
            state = {
                show: true,
            };
            field = new Field(this);

            render() {
                const init = this.field.init;
                return (
                    <div>
                        {this.state.show ? <Input {...init('input')} key="1" /> : <Input {...init('input')} key="2" />}
                        <button
                            onClick={() => {
                                assert('input' in this.field.getValues() === true);
                            }}
                        >
                            click
                        </button>
                    </div>
                );
            }
        }
        wrapper = mount(<Demo />);
        wrapper.setState({ show: false });
        wrapper.find('button').simulate('click');

        done();
    });

    it('should support more than 1 Component with same name, delete one , can still getValue', function(done) {
        class Demo extends React.Component {
            state = {
                show: true,
            };
            field = new Field(this);

            render() {
                const init = this.field.init;
                return (
                    <div>
                        {this.state.show ? <Input {...init('input')} /> : null}
                        <Input {...init('input', { initValue: 'test' })} />
                        <button
                            onClick={() => {
                                assert('input' in this.field.getValues() === true);
                                done();
                            }}
                        >
                            click
                        </button>
                    </div>
                );
            }
        }
        wrapper = mount(<Demo />);
        wrapper.setState({ show: false });
        wrapper.update();
        wrapper.find('button').simulate('click');
    });

    it('same name field should cache value when use parseName=true and autoUnmount=true', function(done) {
        const { useState, useMemo } = React;
        // eslint-disable-next-line react/prop-types
        function Demo({ visible = true, getField }) {
            const field = Field.getUseField({ useState, useMemo })({
                autoUnmount: true,
                parseName: true,
                values: {
                    name: 'aa',
                },
            });
            getField(field);
            return (
                <div>
                    <div>{visible && <Input {...field.init('name')} />}</div>
                    <div>{!visible && <Input {...field.init('name')} />}</div>
                </div>
            );
        }
        let field;
        wrapper = mount(<Demo getField={f => (field = f)} />);
        // 首先判断name值是否符合预期
        assert.equal(field.getValue('name'), 'aa');
        // 调整visible，使两个 input 同时触发卸载和挂载
        wrapper.setProps({ visible: false });
        // 判断name值是否保留
        assert.equal(field.getValue('name'), 'aa');
        // 复原visible，使两个 input 同时触发挂载和卸载
        wrapper.setProps({ visible: true });
        // 判断name是否保留
        assert.equal(field.getValue('name'), 'aa');
        done();
    });

    it('should support autoUnmount=false', function(done) {
        class Demo extends React.Component {
            state = {
                show: true,
            };
            field = new Field(this, { autoUnmount: false });

            render() {
                const init = this.field.init;
                return (
                    <div>
                        <Input {...init('input')} />
                        {this.state.show ? <Input {...init('input2', { initValue: 'test2' })} /> : null}
                        <button
                            onClick={() => {
                                assert(this.field.getValue('input2') === 'test2');
                            }}
                        >
                            click
                        </button>
                    </div>
                );
            }
        }
        wrapper = mount(<Demo />);
        wrapper.setState({ show: false });
        wrapper.find('button').simulate('click');

        done();
    });

    it('scrollToFirstError', function(done) {
        class Demo extends React.Component {
            constructor(props) {
                super(props);
                this.field = new Field(this, { scrollToFirstError: true });
            }

            render() {
                const init = this.field.init;
                return (
                    <div>
                        <Input
                            {...init('input', {
                                rules: [{ required: true, message: 'cant be null' }],
                            })}
                        />
                        <button
                            onClick={() => {
                                this.field.validateCallback(error => {
                                    assert(error.input.errors[0] === 'cant be null');
                                });
                            }}
                        >
                            click
                        </button>
                    </div>
                );
            }
        }
        wrapper = mount(<Demo />);
        wrapper.find('button').simulate('click');

        done();
    });

    describe('defaultValue', () => {
        it('should support `defaultValue`', function() {
            const inputValue = 'my value';
            const field = new Field(this);
            field.init('input', { props: { defaultValue: inputValue } });
            assert.equal(field.getValue('input'), inputValue);
        });

        it('should support `defaultValue` with different value name and make camel case', function() {
            const inputValue = 'my value';
            const field = new Field(this);
            field.init('input', { valueName: 'myValue', props: { defaultMyValue: inputValue } });
            assert.equal(field.getValue('input'), inputValue);
        });

        it('should support `defaultValue` with falsy value', function() {
            const inputValue = 0;
            const field = new Field(this);
            field.init('input', { props: { defaultValue: inputValue } });
            assert.equal(field.getValue('input'), inputValue);
        });
    });

    describe('values', () => {
        it('should set default field input values when given `values` in constructor', function() {
            const inputValue = 'my value';
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            assert.equal(field.getValue('input'), inputValue);
        });

        it('should set default field input values when given falsy `values` in constructor', function() {
            const inputValue = 0;
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            field.init('input');
            assert.equal(field.getValue('input'), inputValue);
        });

        it('should set default field input values when given `values` and `parseName` = true in constructor', function() {
            const inputValue = 'my value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        child: inputValue,
                    },
                },
            });
            field.init('input.child');
            assert.equal(field.getValue('input.child'), inputValue);
        });

        it('should allow access with `getValue` before init when given `values` in constructor', function() {
            const inputValue = 'my value';
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            assert.equal(field.getValue('input'), inputValue);
        });

        it('should allow access to with `getValues` before init when given `values` in constructor', function() {
            const inputValue = 'my value';
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            assert.equal(field.getValues().input, inputValue);
        });

        it('should use setValues instead of constructor values on field that has not been initialized', function() {
            const inputValue = 'my value';
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            field.setValue('input', 1);
            assert.equal(field.getValue('input'), 1);
        });

        it('should reset `input` to undefined when given `values` in constructor and call `reset`', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                values: {
                    input: fieldDefault,
                },
            });
            field.init('input');
            field.reset();
            assert.equal(field.getValue('input'), undefined);
        });

        it('should reset `input` to constructor `undefined` after calling `resetToDefault`', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                values: {
                    input: fieldDefault,
                },
            });
            field.init('input');
            field.resetToDefault('input');
            assert.equal(field.getValue('input'), undefined);
        });

        it('should reset `input` to undefined when given `values` in constructor and call `reset`', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                values: {
                    input: fieldDefault,
                },
            });
            field.init('input');
            field.reset();
            assert.equal(field.getValue('input'), undefined);
        });

        it('should return `{}` for `getValues after all fields are removed', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                values: {
                    input: fieldDefault,
                },
            });
            field.init('input');
            field.remove('input');
            assert.equal(Object.keys(field.getValues()).length, 0);
        });

        it('should return `undefined` after `remove` then re-`init`', function() {
            const field = new Field(this, { values: { input: 4 } });
            field.init('input');
            field.remove('input');
            field.init('input');

            assert(field.getValue('input') === undefined);
        });

        it('should set the value to constructor value even with initValue from init', function() {
            const inputValue = 0;
            const field = new Field(this, {
                values: {
                    input: inputValue,
                },
            });
            field.init('input', { initValue: 1 });
            assert.equal(field.getValue('input'), inputValue);
        });
    });

    describe('should support parseName', () => {
        it('getValues', function(done) {
            const field = new Field(this, { parseName: true });
            field.init('user.name', { initValue: 'frankqian' });
            field.init('user.pwd', { initValue: 12345 });
            field.init('option[0]', { initValue: 'option1' });
            field.init('option[1]', { initValue: 'option2' });
            const values = field.getValues();

            assert(Object.keys(values).length === 2);
            assert(values.user.name === 'frankqian');
            assert(values.user.pwd === 12345);
            assert(values.option[0] === 'option1');

            assert(field.getValue('option[1]') === 'option2');

            done();
        });
        it('should get constructor value of `name` if `getValue` called before init', function() {
            const field = new Field(this, {
                parseName: true,
                values: { a: { b: 1 } },
            });
            assert(field.getValue('a.b') === 1);
        });

        it('should return constructor value for `names` if `getValues` called before init', function() {
            const field = new Field(this, { parseName: true, values: { a: 1, b: 2, c: 3 } });
            const { a, b } = field.getValues(['a', 'b']);
            assert(a === 1);
            assert(b === 2);
        });
        it('should return all of constructor value if `getValues` called with no names before init', function() {
            const field = new Field(this, { parseName: true, values: { a: 1, b: 2, c: 3 } });
            const { a, b, c } = field.getValues();
            assert(a === 1);
            assert(b === 2);
            assert(c === 3);
        });
        it('setValues', function(done) {
            const field = new Field(this, { parseName: true });
            field.init('user.name', { initValue: 'frankqian' });
            field.init('user.pwd', { initValue: 12345 });
            field.init('option[0]', { initValue: 'option1' });
            field.init('option[1]', { initValue: 'option2' });

            let values = field.getValues();
            assert(values.user.name === 'frankqian');
            assert(values.user.pwd === 12345);
            assert(values.option[0] === 'option1');
            assert(values.option[1] === 'option2');

            field.setValues({
                user: {
                    pwd: 'helloworld',
                },
                option: ['test1', 'test2'],
            });

            values = field.getValues();

            assert(Object.keys(values).length === 2);

            assert(values.user.name === 'frankqian');
            assert(values.user.pwd === 'helloworld');
            assert(values.option[0] === 'test1');

            done();
        });

        it('should allow access with `getValue` before init when given `values` in constructor', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            assert.equal(field.getValue('input.myValue'), fieldDefault);
        });

        it('should allow access to with `getValues` before init when given `values` in constructor', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            assert.equal(field.getValues().input.myValue, fieldDefault);
        });

        it('should use setValue instead of constructor values on field that has not been initialized', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            field.setValue('input.myValue', 1);
            assert.equal(field.getValue('input.myValue'), 1);
        });

        it('should remove top level field after removed', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            field.init('input.myValue');
            field.remove('input.myValue');
            assert.equal(Object.keys(field.getValues()).input, undefined);
        });

        it('should return `{}` for `getValues after `remove()`', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            field.init('input.myValue');
            field.setValue('input.value2', fieldDefault);
            field.remove();
            assert.equal(Object.keys(field.getValues()).length, 0);
        });

        it('should return `undefined` after `remove` then re-`init`', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });
            field.init('input.myValue');
            field.remove('input.myValue');
            field.init('input.myValue');

            assert(field.getValue('input.myValue') === undefined);
        });

        it('should return all setValues', function() {
            const fieldDefault = 'field default value';
            const field = new Field(this, {
                parseName: true,
            });
            field.setValues({
                input: {
                    myValue: fieldDefault,
                },
            });

            assert.deepEqual(field.getValues(), {
                input: { myValue: fieldDefault },
            });
        });

        it('should return all setValues and initValues', function() {
            const fieldDefault = 'field default value';
            const otherDefault = 'other default value';
            const field = new Field(this, {
                parseName: true,
            });
            field.setValues({
                input: {
                    myValue: fieldDefault,
                },
            });

            field.init('input.otherValue', { initValue: otherDefault });

            assert.deepEqual(field.getValues(), {
                input: {
                    myValue: fieldDefault,
                    otherValue: otherDefault,
                },
            });
        });
        describe('reset', function() {
            it('should reset all to undefined when call `reset`', function() {
                const fieldDefault = 'field default value';
                const field = new Field(this, {
                    parseName: true,
                });
                field.setValue('input.myValue', fieldDefault);
                field.setValue('input.otherValue', fieldDefault);
                field.reset();
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), undefined);
            });

            it('should reset all to undefined when given `values` in constructor and call `reset`', function() {
                const fieldDefault = 'field default value';
                const field = new Field(this, {
                    parseName: true,
                    values: {
                        input: {
                            myValue: fieldDefault,
                            otherValue: fieldDefault,
                        },
                    },
                });
                field.init('input.myValue');
                field.init('input.otherValue');
                field.reset();
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), undefined);
            });

            it('should reset only `input.myValue` to undefined when given `values` in constructor and pass `input.myValue` to `reset`', function() {
                const fieldDefault = 'field default value';
                const field = new Field(this, {
                    parseName: true,
                    values: {
                        input: {
                            myValue: fieldDefault,
                            otherValue: fieldDefault,
                        },
                    },
                });
                field.init('input.myValue');
                field.reset('input.myValue');
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), fieldDefault);
            });

            it('should reset all to undefined when call `resetToDefault` with no defaults', function() {
                const fieldDefault = 'field default value';
                const field = new Field(this, {
                    parseName: true,
                });
                field.setValue('input.myValue', fieldDefault);
                field.setValue('input.otherValue', fieldDefault);
                field.resetToDefault();
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), undefined);
            });

            it('should reset all to undefined when given `values` in constructor and call `resetToDefault`', function() {
                const fieldDefault = 'field default value';
                const secondValue = 'second';
                const field = new Field(this, {
                    parseName: true,
                    values: {
                        input: {
                            myValue: fieldDefault,
                            otherValue: fieldDefault,
                        },
                    },
                });
                field.init('input.myValue');
                field.init('input.otherValue');
                field.setValue('input.myValue', secondValue);
                field.setValue('input.otherValue', secondValue);

                // simulation rerender
                field.init('input.myValue');
                field.init('input.otherValue');

                field.resetToDefault();
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), undefined);
            });

            it('should reset `input.myValue` which inited to undefined when given `values` in constructor and call `resetToDefault`', function() {
                const fieldDefault = 'field default value';
                const secondValue = 'second';
                const field = new Field(this, {
                    parseName: true,
                    values: {
                        input: {
                            myValue: fieldDefault,
                            otherValue: fieldDefault,
                        },
                    },
                });
                field.init('input.myValue');
                field.setValue('input.myValue', secondValue);
                field.setValue('input.otherValue', secondValue);

                field.init('input.myValue');

                field.resetToDefault('input.myValue');
                assert.equal(field.getValue('input.myValue'), undefined);
                assert.equal(field.getValue('input.otherValue'), secondValue);
            });
        });

        it('should set the value to constructor value even with initValue from init', function() {
            const fieldDefault = 0;
            const initValue = 'other default value';
            const field = new Field(this, {
                parseName: true,
                values: {
                    input: {
                        myValue: fieldDefault,
                    },
                },
            });

            field.init('input.myValue', { initValue });

            assert.deepEqual(field.getValues(), {
                input: {
                    myValue: fieldDefault,
                },
            });
        });

        // Fix https://github.com/alibaba-fusion/next/issues/4525
        it('overwrite values by setValues', function() {
            const field = new Field(this, {
                parseName: true,
                values: {
                    one: [
                        [
                            {
                                b: { name: 'zhangsan', age: 17 },
                            },
                        ],
                    ],
                    two: { code: '555' },
                },
            });
            const name = field.init('one.0.0.b.name');
            const age = field.init('one.0.0.b.age');
            const code = field.init('two.code');
            assert.equal(name.value, 'zhangsan');
            assert.equal(age.value, 17);
            assert.equal(code.value, '555');

            field.setValues({
                one: [
                    [
                        {
                            b: null,
                        },
                    ],
                ],
                two: '',
            });
            assert.equal(field.init('one.0.0.b.name').value, undefined);
            assert.equal(field.init('one.0.0.b.age').value, undefined);
            assert.equal(field.init('two.code').value, undefined);
        });
    });

    describe('should support autoValidate=false', () => {
        it('options.autoValidate=true', function(done) {
            const field = new Field(this, { autoValidate: true });
            const inited = field.init('input', { rules: [{ minLength: 10 }] });

            wrapper = mount(<Input {...inited} />);
            wrapper.find('input').simulate('change', {
                target: {
                    value: 'test',
                },
            });

            assert(field.getError('input') !== null);

            done();
        });
        it('options.autoValidate=false', function(done) {
            const field = new Field(this, { autoValidate: false });
            const inited = field.init('input', { rules: [{ minLength: 10 }] });

            wrapper = mount(<Input {...inited} />);
            wrapper.find('input').simulate('change', {
                target: {
                    value: 'test',
                },
            });

            assert(field.getError('input') === null);

            field.validateCallback('input');
            assert(field.getError('input') !== null);

            done();
        });
        it('props.autoValidate=false', function(done) {
            const field = new Field(this);
            const inited = field.init('input', {
                autoValidate: false,
                rules: [{ minLength: 10 }],
            });

            wrapper = mount(<Input {...inited} />);
            wrapper.find('input').simulate('change', {
                target: {
                    value: 'test',
                },
            });

            assert(field.getError('input') === null);

            field.validateCallback('input');
            assert(field.getError('input') !== null);

            done();
        });
    });

    describe('processErrorMessage', () => {
        it('should pass error messages to `processErrorMessage` on validate', function(done) {
            const mySpy = spy();
            const field = new Field(this, { processErrorMessage: mySpy });
            const inited = field.init('input', {
                initValue: 'test',
                rules: [{ minLength: 10, message: 'my error message' }],
            });

            wrapper = mount(<Input {...inited} />);
            field.validateCallback();

            assert(mySpy.calledOnce);
            assert(mySpy.args[0][0] === 'my error message');
            done();
        });
    });

    describe('afterValidateRerender', () => {
        it('should pass error messages to `afterValidateRerender` on validate', function(done) {
            const mySpy = spy();
            const field = new Field(this, { afterValidateRerender: mySpy });
            const inited = field.init('input', {
                initValue: 'test',
                rules: [{ minLength: 10, message: 'my error message' }],
            });

            wrapper = mount(<Input {...inited} />);
            field.validateCallback();

            assert(mySpy.calledOnce);
            assert.equal(mySpy.args[0][0].errorsGroup.input.errors, 'my error message');
            assert.equal(mySpy.args[0][0].options, field.options);
            assert.equal(mySpy.args[0][0].instance, field.instance);

            done();
        });
    });

    describe('messages', () => {
        it('should support custom messages', function(done) {
            const mySpy = spy();
            const field = new Field(this, {
                afterValidateRerender: mySpy,
                messages: {
                    string: {
                        minLength: 'custom error message',
                    },
                },
            });
            const inited = field.init('input', { initValue: 'test', rules: [{ minLength: 10 }] });

            wrapper = mount(<Input {...inited} />);
            field.validateCallback();

            assert(mySpy.calledOnce);
            assert.equal(mySpy.args[0][0].errorsGroup.input.errors, 'custom error message');
            assert.equal(mySpy.args[0][0].options, field.options);
            assert.equal(mySpy.args[0][0].instance, field.instance);

            done();
        });

        it('should prefer user passed messages', function(done) {
            const mySpy = spy();
            const field = new Field(this, {
                afterValidateRerender: mySpy,
                messages: {
                    string: {
                        minLength: 'custom error message',
                    },
                },
            });
            const inited = field.init('input', {
                initValue: 'test',
                rules: [{ minLength: 10, message: 'my error message' }],
            });

            wrapper = mount(<Input {...inited} />);
            field.validateCallback();

            assert(mySpy.calledOnce);
            assert.equal(mySpy.args[0][0].errorsGroup.input.errors, 'my error message');
            assert.equal(mySpy.args[0][0].options, field.options);
            assert.equal(mySpy.args[0][0].instance, field.instance);

            done();
        });
    });
});
