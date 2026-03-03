declare const CreateAToken: {
    readonly body: {
        readonly type: "object";
        readonly properties: {
            readonly card: {
                readonly type: "object";
                readonly description: "Card object. Ensure that your business account has the access to use this API.";
                readonly properties: {
                    readonly number: {
                        readonly type: "integer";
                        readonly description: "Credit card number";
                        readonly default: 4508750015741019;
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly exp_month: {
                        readonly type: "integer";
                        readonly description: "Two -digit number, representing month";
                        readonly default: 1;
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly exp_year: {
                        readonly type: "integer";
                        readonly description: "Last two digits of the expiration year";
                        readonly default: 2039;
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly cvc: {
                        readonly type: "integer";
                        readonly description: "Card verification code";
                        readonly default: 100;
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly name: {
                        readonly type: "string";
                        readonly description: "Card holder Name";
                        readonly default: "test user";
                    };
                    readonly address: {
                        readonly type: "object";
                        readonly description: "Address";
                        readonly properties: {
                            readonly country: {
                                readonly type: "string";
                                readonly description: "County";
                                readonly default: "Kuwait";
                            };
                            readonly line1: {
                                readonly type: "string";
                                readonly description: "Address Line 1";
                                readonly default: "Salmiya, 21";
                            };
                            readonly city: {
                                readonly type: "string";
                                readonly description: "City";
                                readonly default: "Kuwait city";
                            };
                            readonly street: {
                                readonly type: "string";
                                readonly description: "Street";
                                readonly default: "Salim";
                            };
                            readonly avenue: {
                                readonly type: "string";
                                readonly description: "Avenue";
                                readonly default: "Gulf";
                            };
                        };
                    };
                };
            };
            readonly client_ip: {
                readonly type: "string";
                readonly description: "The IP Address of the client.";
                readonly default: "192.168.1.20";
            };
        };
        readonly $schema: "https://json-schema.org/draft/2020-12/schema#";
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly examples: readonly ["tok_SpTV5823926VPgE27bU3O801"];
                };
                readonly created: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly examples: readonly [1682587618801];
                };
                readonly object: {
                    readonly type: "string";
                    readonly examples: readonly ["token"];
                };
                readonly live_mode: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly examples: readonly [false];
                };
                readonly type: {
                    readonly type: "string";
                    readonly examples: readonly ["CARD"];
                };
                readonly used: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly examples: readonly [false];
                };
                readonly card: {
                    readonly type: "object";
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly examples: readonly ["card_u35O5823926okiJ27sk3D805"];
                        };
                        readonly object: {
                            readonly type: "string";
                            readonly examples: readonly ["card"];
                        };
                        readonly address: {
                            readonly type: "object";
                            readonly properties: {
                                readonly country: {
                                    readonly type: "string";
                                    readonly examples: readonly ["Kuwait"];
                                };
                                readonly city: {
                                    readonly type: "string";
                                    readonly examples: readonly ["Kuwait city"];
                                };
                                readonly avenue: {
                                    readonly type: "string";
                                    readonly examples: readonly ["Gulf"];
                                };
                                readonly street: {
                                    readonly type: "string";
                                    readonly examples: readonly ["Salim"];
                                };
                                readonly line1: {
                                    readonly type: "string";
                                    readonly examples: readonly ["Salmiya, 21"];
                                };
                            };
                        };
                        readonly funding: {
                            readonly type: "string";
                            readonly examples: readonly ["DEBIT"];
                        };
                        readonly fingerprint: {
                            readonly type: "string";
                            readonly examples: readonly ["E1I78d8PV0UHivCrvV8dTkI%2FQJRHPow4XAU4FfmZxCQ%3D"];
                        };
                        readonly brand: {
                            readonly type: "string";
                            readonly examples: readonly ["VISA"];
                        };
                        readonly scheme: {
                            readonly type: "string";
                            readonly examples: readonly ["VISA"];
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly examples: readonly ["test user"];
                        };
                        readonly issuer: {
                            readonly type: "object";
                            readonly properties: {
                                readonly bank: {
                                    readonly type: "string";
                                    readonly examples: readonly ["THE CO-OPERATIVE BANK PLC"];
                                };
                                readonly country: {
                                    readonly type: "string";
                                    readonly examples: readonly ["GB"];
                                };
                                readonly id: {
                                    readonly type: "string";
                                    readonly examples: readonly ["bnk_TS06A1120231227Kx242704090"];
                                };
                            };
                        };
                        readonly exp_month: {
                            readonly type: "integer";
                            readonly default: 0;
                            readonly examples: readonly [1];
                        };
                        readonly exp_year: {
                            readonly type: "integer";
                            readonly default: 0;
                            readonly examples: readonly [39];
                        };
                        readonly last_four: {
                            readonly type: "string";
                            readonly examples: readonly ["1019"];
                        };
                        readonly first_six: {
                            readonly type: "string";
                            readonly examples: readonly ["450875"];
                        };
                    };
                };
            };
            readonly $schema: "https://json-schema.org/draft/2020-12/schema#";
        };
    };
};
declare const RetrieveAToken: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly token_id: {
                    readonly type: "string";
                    readonly default: "tok_o7EM58231043tTZT274u3W894";
                    readonly $schema: "https://json-schema.org/draft/2020-12/schema#";
                    readonly description: "Unique identifier for the object.";
                };
            };
            readonly required: readonly ["token_id"];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly examples: readonly ["tok_4VpPvSNJUHn723embBWuAgoK"];
                };
                readonly object: {
                    readonly type: "string";
                    readonly examples: readonly ["token"];
                };
                readonly card: {
                    readonly type: "object";
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly examples: readonly ["card_Yi1lfqAk7twr8Be3hTPg0Fv4"];
                        };
                        readonly object: {
                            readonly type: "string";
                            readonly examples: readonly ["card"];
                        };
                        readonly address: {
                            readonly type: "object";
                            readonly properties: {};
                        };
                        readonly customer: {
                            readonly type: "string";
                            readonly examples: readonly ["cst_sdsbd7tsd977"];
                        };
                        readonly funding: {
                            readonly type: "string";
                            readonly examples: readonly ["CREDIT"];
                        };
                        readonly fingerprint: {
                            readonly type: "string";
                            readonly examples: readonly ["t9g/phBxZ9ZR6JgHBZ8ty2Yfy"];
                        };
                        readonly brand: {
                            readonly type: "string";
                            readonly examples: readonly ["AMEX"];
                        };
                        readonly exp_month: {
                            readonly type: "integer";
                            readonly default: 0;
                            readonly examples: readonly [12];
                        };
                        readonly exp_year: {
                            readonly type: "integer";
                            readonly default: 0;
                            readonly examples: readonly [2019];
                        };
                        readonly last_four: {
                            readonly type: "string";
                            readonly examples: readonly ["0005"];
                        };
                        readonly first_six: {
                            readonly type: "string";
                            readonly examples: readonly ["378282"];
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly examples: readonly ["test user"];
                        };
                    };
                };
                readonly client_ip: {
                    readonly type: "string";
                    readonly examples: readonly ["127.0.0.1"];
                };
                readonly created: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly examples: readonly [1533728879];
                };
                readonly live_mode: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly examples: readonly [false];
                };
                readonly type: {
                    readonly type: "string";
                    readonly examples: readonly ["CARD"];
                };
                readonly used: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly examples: readonly [false];
                };
            };
            readonly $schema: "https://json-schema.org/draft/2020-12/schema#";
        };
        readonly "400": {
            readonly type: "object";
            readonly properties: {};
            readonly $schema: "https://json-schema.org/draft/2020-12/schema#";
        };
    };
};
export { CreateAToken, RetrieveAToken };
