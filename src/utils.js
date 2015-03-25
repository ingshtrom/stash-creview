var spawn = require('child_process').spawn,
    Promise = require('bluebird'),
    async = Promise.promisifyAll(require('async')),
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
 * @param  {string}   currentUser  
 * @param  {object}   stash      the StashApi object
 * @param  {object}   repoConfig .creview-config from the repo root
 * @param  {[string]} sections   sections to select reviewers from
 * @return {promise}             see below for promise return object:
 * [
 *   {
 *     "user": {
 *       "name": "ingshtrom"
 *     }
 *   },
 *   ...
 * ]
 */
function getReviewers (currentUser, stash, repoConfig, sections) {
    var promises = [];

    _.each(sections, function (secVal) {
        var sec = _.find(repoConfig.sections, { key: secVal }),
            curPromise;

        // is it a valid section?
        if (!sec) {
            return false;
        }

        curPromise = stash.getGroupMembers({
            context: sec.groupSlug,
            limit: 1000
        })
        .spread(function (response, body) {
            var reviewers = body.values,
                // http://stackoverflow.com/questions/4550505/getting-random-value-from-an-array
                reviewer = reviewers[Math.floor(Math.random() * body.size)],
                count = 0;

            // make sure the current user isn't a reviewer
            while (reviewer && reviewer.slug === currentUser && count < 50) {
                console.log('had to try to get another user!');
                reviewer = reviewers[Math.floor(Math.random() * body.size)];
                count++;
            }

            // throw an error if we didn't find a reviewer
            if (count === 50) {
                throw new Error('Could not find a reviewer that was not the current user for the section: ' + sec.groupSlug);
            }

            if (reviewer) {
                return {
                    user: {
                        name: reviewer.slug
                    }
                };
            }
            // yes, we don't want to return anything if the reviewer is not valid
        })
        .catch(function (err) {
            logger.error('An error occurred while getting reviewers: ' + err);
        })
        promises.push(curPromise);
    });

    return Promise.all(promises)
    .then(function (results) {
        return _.filter(results, function (v) {
            return v;
        });
    });
}