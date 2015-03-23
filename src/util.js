var spawn = require('child_process').spawn,
    Promise = require('bluebird'),
    logger = require('./logger').logger,
    _ = require('lodash');

// MODULE API
module.exports.getRepoRoot = getRepoRoot;
module.exports.getReviewers = getReviewers;

// MODULE IMPLEMENTATIONS
function getRepoRoot () {
    return new Promise(function (resolve, reject) {
        var git = spawn('git', ['rev-parse', '--show-toplevel']),
            output = '';

        git.stdout.on('data', function (data) {
            output += data;
        });

        git.stderr.on('data', function (data) {
            logger.log('error', 'stderr when getting the root of your repository: ' + data);
        });

        git.on('close', function (code) {
            resolve(output.replace(/\s/g, ''));
        });
    })
}

/**
 * get reviewers that are formatted for the Stash API
 *
 * 
 * @param  {object}   repoConfig .creview-config from the repo root
 * @param  {[string]} sections   sections to select reviewers from
 * @return {[object]}            see below:
 * [
 *   {
 *     "user": {
 *       "name": "ingshtrom"
 *     }
 *   },
 *   ...
 * ]
 */
function getReviewers (repoConfig, sections) {
    var result = [], 
        badRun = false;

    _.each(sections, function (secVal) {
        var reviewers,
            sec = _.find(repoConfig.sections, { key: secVal });

        // is it a valid section?
        if (!sec) {
            return false;
        }

        reviewers = sec.reviewers;

        // http://stackoverflow.com/questions/4550505/getting-random-value-from-an-array
        result.push({
            user: {
                name: reviewers[Math.floor(Math.random() * reviewers.length)]
            }
        });
    });
    return result.length === 0 ? null : result;
}