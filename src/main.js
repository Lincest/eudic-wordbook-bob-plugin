/**
 * 欧路词典单词本插件
 */

// 欧路词典 API
const EUDIC_ADD_WORD_URL = "https://api.frdic.com/api/open/v1/studylist/words";
const EUDIC_BOOK_LIST_URL = "https://api.frdic.com/api/open/v1/studylist/category?language=en";
const DICTIONARY_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

// 单词格式验证正则表达式
const WORD_PATTERN = /^[a-zA-Z]+(-[a-zA-Z]+)*$/;

function buildResult(res) {
    return {
        "from": "en",
        "to": "zh-Hans",
        "toParagraphs": [res],
        "fromParagraphs": ["success add to word book"]
    };
}

function buildError(res) {
    return {
        'type': 'param',
        'message': res,
        'addtion': '无'
    };
}

// 支持的语言
function supportLanguages() {
    return ['zh-Hans', 'en'];
}

// 验证插件配置
function pluginValidate(completion) {
    const authorization = $option.authorization;
    const wordbook_id = $option.wordbook_id;

    if (!authorization) {
        completion({
            result: false,
            error: {
                type: "secretKey",
                message: "未设置认证信息。",
                troubleshootingLink: "https://github.com/yuhaowin/wordbook-bob-plugin"
            }
        });
        return;
    }

    if (!wordbook_id) {
        queryEudicWordbookIds(authorization, completion);
    } else {
        // 使用测试单词验证配置
        addWordEudic(authorization, 'test', wordbook_id, function (res) {
            if (201 === res.response.statusCode) {
                completion({result: true});
            } else {
                queryEudicWordbookIds(authorization, completion);
            }
        });
    }
}

// 查询欧路词典单词本列表
function queryEudicWordbookIds(token, completion) {
    $http.get({
        url: EUDIC_BOOK_LIST_URL,
        header: {
            'Authorization': token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36'
        },
        handler: function (res) {
            const statusCode = res.response.statusCode;
            if (statusCode === 200) {
                const data = res.data.data;
                completion({
                    result: false,
                    error: {
                        type: "param",
                        message: "请选择欧路词典单词本 id : \r\n" + JSON.stringify(data, null, 4)
                    }
                });
            } else {
                completion({
                    result: false,
                    error: {
                        type: "param",
                        message: "欧路词典 token 错误或过期，请重新填写。",
                        troubleshootingLink: "https://github.com/yuhaowin/wordbook-bob-plugin"
                    }
                });
            }
        }
    });
}

// 本地验证单词格式
function isValidWordFormat(word) {
    // 检查基本格式（只包含字母和连字符）
    if (!WORD_PATTERN.test(word)) {
        return false;
    }
    
    // 检查长度（避免过长的无意义字符串）
    if (word.length > 45) {
        return false;
    }

    return true;
}

// 在线验证单词
function validateWordOnline(word) {
    return new Promise((resolve) => {
        $http.get({
            url: DICTIONARY_API + encodeURIComponent(word),
            handler: function(res) {
                if (res.response.statusCode === 200 && Array.isArray(res.data) && res.data.length > 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
        });
    });
}

// 添加单词到欧路词典
function addWordEudic(token, word, wordbook_id, handler) {
    $http.post({
        url: EUDIC_ADD_WORD_URL,
        header: {
            'Authorization': token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36'
        },
        body: {
            "id": wordbook_id,
            "language": "en",
            "words": [word]
        },
        handler: handler
    });
}

// 主要翻译处理函数
// 修改 translate 函数，移除 async
function translate(query, completion) {
    const text = query.text.trim().toLowerCase();
    const from_language = query.detectFrom;
    const word_only = $option.word_only;
    const authorization = $option.authorization;
    const wordbook_id = $option.wordbook_id;
    const need_save = (word_only == 0 || text.search(' ') < 1);

    if (from_language != 'en' || !need_save) {
        completion({'result': buildResult("中文、非英语单词无需添加单词本")});
        return;
    }

    if (!authorization || !wordbook_id) {
        completion({'error': buildError('认证信息或单词本 ID 缺失')});
        return;
    }

    // 第一步：检查单词格式
    if (!isValidWordFormat(text)) {
        completion({'error': buildError(`"${text}" 格式不符合英文单词规范`)});
        return;
    }

    // 第二步：在线验证单词
    validateWordOnline(text).then(isValid => {
        if (!isValid) {
            completion({'error': buildError(`"${text}" 不是有效的英文单词`)});
            return;
        }

        // 添加到欧路词典单词本
        addWordEudic(authorization, text, wordbook_id, function (res) {
            if (201 === res.response.statusCode) {
                completion({'result': buildResult("添加单词成功")});
            } else {
                completion({'error': buildError('添加单词失败，请检查认证信息是否有效')});
            }
        });
    }).catch(error => {
        $log.error('验证单词时出错：' + error);
        // 如果在线验证失败，仍然允许添加符合基本格式的单词
        if (isValidWordFormat(text)) {
            addWordEudic(authorization, text, wordbook_id, function (res) {
                if (201 === res.response.statusCode) {
                    completion({'result': buildResult("添加单词成功")});
                } else {
                    completion({'error': buildError('添加单词失败，请检查认证信息是否有效')});
                }
            });
        } else {
            completion({'error': buildError('验证单词时出错，且输入不符合单词格式')});
        }
    });
}