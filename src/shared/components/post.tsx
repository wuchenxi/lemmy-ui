import { Component, linkEvent } from "inferno";
import { HtmlTags } from "./html-tags";
import { Spinner } from "./icon";
import { Subscription } from "rxjs";
import {
  UserOperation,
  PostView,
  GetPostResponse,
  PostResponse,
  MarkCommentAsRead,
  CommentResponse,
  CommunityResponse,
  BanFromCommunityResponse,
  BanPersonResponse,
  AddModToCommunityResponse,
  AddAdminResponse,
  SearchType,
  SortType,
  Search,
  GetPost,
  SearchResponse,
  GetSiteResponse,
  GetCommunityResponse,
  ListingType,
} from "lemmy-js-client";
import {
  CommentSortType,
  CommentViewType,
  InitialFetchRequest,
  CommentNode as CommentNodeI,
} from "../interfaces";
import { WebSocketService, UserService } from "../services";
import {
  wsJsonToRes,
  toast,
  editCommentRes,
  saveCommentRes,
  createCommentLikeRes,
  createPostLikeRes,
  commentsToFlatNodes,
  setupTippy,
  setIsoData,
  getIdFromProps,
  getCommentIdFromProps,
  wsSubscribe,
  isBrowser,
  previewLines,
  isImage,
  wsUserOp,
  wsClient,
  authField,
  setOptionalAuth,
  saveScrollPosition,
  restoreScrollPosition,
  buildCommentsTree,
  insertCommentIntoTree,
} from "../utils";
import { PostListing } from "./post-listing";
import { Sidebar } from "./sidebar";
import { CommentForm } from "./comment-form";
import { CommentNodes } from "./comment-nodes";
import autosize from "autosize";
import { i18n } from "../i18next";

interface PostState {
  postRes: GetPostResponse;
  postId: number;
  commentTree: CommentNodeI[];
  commentId?: number;
  commentSort: CommentSortType;
  commentViewType: CommentViewType;
  scrolled?: boolean;
  loading: boolean;
  crossPosts: PostView[];
  siteRes: GetSiteResponse;
}


function clickTweet(){
  window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(document.title) + ':%20 ' + encodeURIComponent(document.URL));
}

function clickFaceBook(){
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(document.URL) + '&t=' + encodeURIComponent(document.URL));
}

function clickTelegram(){
  window.open('https://telegram.me/share/url?text=' + encodeURIComponent(document.title) + '&url=' + encodeURIComponent(document.URL));
}

function clickEmail(){
  window.open('mailto:?subject=' + encodeURIComponent(document.title) + '&body=' + encodeURIComponent(document.URL));
}

function clickLine(){
  window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(document.URL)); 
}

function clickTumblr(){
  window.open('https://www.tumblr.com/widgets/share/tool?posttype=link&title=' + encodeURIComponent(document.title) + '&caption=' + encodeURIComponent(document.title) + '&content=' + encodeURIComponent(document.URI) + '&canonicalUrl=' + encodeURIComponent(document.URI));
}

function clickReddit(){
  window.open('https://reddit.com/submit/?url=' + encodeURIComponent(document.URI) + '&resubmit=true&title=' + encodeURIComponent(document.title));
}

function clickLinkedin(){
  window.open('https://www.linkedin.com/shareArticle?mini=true&url=' + encodeURIComponent(document.URI) + '&title=' + encodeURIComponent(document.title) + '&summary=' + encodeURIComponent(document.title) + '&source=' + encodeURIComponent(document.URI));
}

function clickWhatsapp(){
  window.open('whatsapp://send?text=' + encodeURIComponent(document.URI));
}

export class Post extends Component<any, PostState> {
  private subscription: Subscription;
  private isoData = setIsoData(this.context);
  private emptyState: PostState = {
    postRes: null,
    postId: getIdFromProps(this.props),
    commentTree: [],
    commentId: getCommentIdFromProps(this.props),
    commentSort: CommentSortType.Hot,
    commentViewType: CommentViewType.Tree,
    scrolled: false,
    loading: true,
    crossPosts: [],
    siteRes: this.isoData.site_res,
  };

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;

    this.parseMessage = this.parseMessage.bind(this);
    this.subscription = wsSubscribe(this.parseMessage);

    // Only fetch the data if coming from another route
    if (this.isoData.path == this.context.router.route.match.url) {
      this.state.postRes = this.isoData.routeData[0];
      this.state.commentTree = buildCommentsTree(
        this.state.postRes.comments,
        this.state.commentSort
      );
      this.state.loading = false;

      if (isBrowser()) {
        this.fetchCrossPosts();
        if (this.state.commentId) {
          this.scrollCommentIntoView();
        }
      }
    } else {
      this.fetchPost();
    }
  }

  fetchPost() {
    let form: GetPost = {
      id: this.state.postId,
      auth: authField(false),
    };
    WebSocketService.Instance.send(wsClient.getPost(form));
  }

  fetchCrossPosts() {
    if (this.state.postRes.post_view.post.url) {
      let form: Search = {
        q: this.state.postRes.post_view.post.url,
        type_: SearchType.Url,
        sort: SortType.TopAll,
        listing_type: ListingType.All,
        page: 1,
        limit: 6,
        auth: authField(false),
      };
      WebSocketService.Instance.send(wsClient.search(form));
    }
  }

  static fetchInitialData(req: InitialFetchRequest): Promise<any>[] {
    let pathSplit = req.path.split("/");
    let promises: Promise<any>[] = [];

    let id = Number(pathSplit[2]);

    let postForm: GetPost = {
      id,
    };
    setOptionalAuth(postForm, req.auth);

    promises.push(req.client.getPost(postForm));

    return promises;
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
    window.isoData.path = undefined;
    saveScrollPosition(this.context);
  }

  componentDidMount() {
    WebSocketService.Instance.send(
      wsClient.postJoin({ post_id: this.state.postId })
    );
    autosize(document.querySelectorAll("textarea"));
  }

  componentDidUpdate(_lastProps: any, lastState: PostState) {
    if (
      this.state.commentId &&
      !this.state.scrolled &&
      lastState.postRes &&
      lastState.postRes.comments.length > 0
    ) {
      this.scrollCommentIntoView();
    }

    // Necessary if you are on a post and you click another post (same route)
    if (_lastProps.location.pathname !== _lastProps.history.location.pathname) {
      // TODO Couldnt get a refresh working. This does for now.
      location.reload();

      // let currentId = this.props.match.params.id;
      // WebSocketService.Instance.getPost(currentId);
      // this.context.refresh();
      // this.context.router.history.push(_lastProps.location.pathname);
    }
  }

  scrollCommentIntoView() {
    var elmnt = document.getElementById(`comment-${this.state.commentId}`);
    elmnt.scrollIntoView();
    elmnt.classList.add("mark");
    this.state.scrolled = true;
    this.markScrolledAsRead(this.state.commentId);
  }

  // TODO this needs some re-work
  markScrolledAsRead(commentId: number) {
    let found = this.state.postRes.comments.find(
      c => c.comment.id == commentId
    );
    let parent = this.state.postRes.comments.find(
      c => found.comment.parent_id == c.comment.id
    );
    let parent_person_id = parent
      ? parent.creator.id
      : this.state.postRes.post_view.creator.id;

    if (
      UserService.Instance.localUserView &&
      UserService.Instance.localUserView.person.id == parent_person_id
    ) {
      let form: MarkCommentAsRead = {
        comment_id: found.comment.id,
        read: true,
        auth: authField(),
      };
      WebSocketService.Instance.send(wsClient.markCommentAsRead(form));
      UserService.Instance.unreadCountSub.next(
        UserService.Instance.unreadCountSub.value - 1
      );
    }
  }

  get documentTitle(): string {
    return `${this.state.postRes.post_view.post.name} - ${this.state.siteRes.site_view.site.name}`;
  }

  get imageTag(): string {
    let post = this.state.postRes.post_view.post;
    return (
      post.thumbnail_url ||
      (post.url ? (isImage(post.url) ? post.url : undefined) : undefined)
    );
  }

  get descriptionTag(): string {
    let body = this.state.postRes.post_view.post.body;
    return body ? previewLines(body) : undefined;
  }

  render() {
    let pv = this.state.postRes?.post_view;
    return (
      <div class="container">
        {this.state.loading ? (
          <h5>
            <Spinner />
          </h5>
        ) : (
          <div class="row">
            <div class="col-12 col-md-8 mb-3">
              <HtmlTags
                title={this.documentTitle}
                path={this.context.router.route.match.url}
                image={this.imageTag}
                description={this.descriptionTag}
              />
              <PostListing
                post_view={pv}
                duplicates={this.state.crossPosts}
                showBody
                showCommunity
                moderators={this.state.postRes.moderators}
                admins={this.state.siteRes.admins}
                enableDownvotes={
                  this.state.siteRes.site_view.site.enable_downvotes
                }
                enableNsfw={this.state.siteRes.site_view.site.enable_nsfw}
              />
              <div className="mb-2" />
              <p><a class="twitter-share-button" id="tweet" href="#" onclick={clickTweet}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#55acee" d="M23.44 4.83c-.8.37-1.5.38-2.22.02.93-.56.98-.96 1.32-2.02-.88.52-1.86.9-2.9 1.1-.82-.88-2-1.43-3.3-1.43-2.5 0-4.55 2.04-4.55 4.54 0 .36.03.7.1 1.04-3.77-.2-7.12-2-9.36-4.75-.4.67-.6 1.45-.6 2.3 0 1.56.8 2.95 2 3.77-.74-.03-1.44-.23-2.05-.57v.06c0 2.2 1.56 4.03 3.64 4.44-.67.2-1.37.2-2.06.08.58 1.8 2.26 3.12 4.25 3.16C5.78 18.1 3.37 18.74 1 18.46c2 1.3 4.4 2.04 6.97 2.04 8.35 0 12.92-6.92 12.92-12.93 0-.2 0-.4-.02-.6.9-.63 1.96-1.22 2.56-2.14z"/></svg></a> <a class="facebook-share-button" id="fb-share" href="#" onclick={clickFaceBook}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#5b7998" d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.5 3.44 9.5 5.32v2.15h-3v4h3v12h5v-12h3.85l.42-4z"/></svg></a> <a class="telegram-share-button" id="tg-share" href="#" onclick={clickTelegram}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#54A9EB" d="M.707 8.475C.275 8.64 0 9.508 0 9.508s.284.867.718 1.03l5.09 1.897 1.986 6.38a1.102 1.102 0 0 0 1.75.527l2.96-2.41a.405.405 0 0 1 .494-.013l5.34 3.87a1.1 1.1 0 0 0 1.046.135 1.1 1.1 0 0 0 .682-.803l3.91-18.795A1.102 1.102 0 0 0 22.5.075L.706 8.475z"/></svg></a> <a class="line-share-button" id="line-share" href="#" onclick={clickLine}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1em" height="1em"><path fill="#25D366" d="M 480.00,161.21 C 480.00,161.21 511.00,161.21 511.00,161.21 511.00,161.21 522.00,161.96 522.00,161.96 542.55,162.86 562.79,165.16 583.00,169.20 608.21,174.24 633.09,180.88 657.00,190.45 746.89,226.40 825.79,294.36 852.86,390.00 857.33,405.80 859.95,421.65 861.09,438.00 861.09,438.00 862.00,448.00 862.00,448.00 862.35,478.61 858.63,507.02 848.31,536.00 826.54,597.11 777.17,649.89 729.00,691.72 674.32,739.20 598.61,792.21 536.00,828.99 522.93,836.66 501.31,849.07 487.00,852.63 473.99,855.86 465.45,853.06 466.04,838.00 466.04,838.00 472.57,797.00 472.57,797.00 472.57,797.00 473.17,789.00 473.17,789.00 473.95,780.96 474.40,771.25 470.00,764.00 459.18,746.21 424.75,745.59 406.00,741.35 359.34,730.80 316.66,715.70 276.00,689.95 212.78,649.90 162.18,592.49 142.88,519.00 135.83,492.12 134.96,473.39 135.00,446.00 135.04,419.34 143.87,385.59 154.01,361.00 164.37,335.88 179.53,311.83 196.92,291.00 226.42,255.66 263.85,226.82 305.00,206.25 340.51,188.49 377.87,175.48 417.00,168.42 430.12,166.06 457.26,162.07 470.00,162.00 474.45,161.98 475.47,162.07 480.00,161.21 Z M 294.00,510.00 C 294.00,510.00 294.00,451.00 294.00,451.00 294.00,451.00 294.00,387.00 294.00,387.00 293.84,378.69 290.80,377.05 283.00,377.00 283.00,377.00 266.00,377.00 266.00,377.00 262.81,377.01 258.91,376.71 256.23,378.74 252.61,381.47 253.01,385.97 253.00,390.00 253.00,390.00 253.00,513.00 253.00,513.00 253.00,513.00 253.00,539.00 253.00,539.00 253.02,542.32 252.85,545.12 255.31,547.72 258.65,551.26 263.55,550.99 268.00,551.00 268.00,551.00 357.00,551.00 357.00,551.00 366.38,550.95 370.86,549.32 371.00,539.00 371.08,532.83 372.62,515.55 367.72,511.74 365.12,509.71 361.14,510.01 358.00,510.00 358.00,510.00 294.00,510.00 294.00,510.00 M 397.02,377.21 C 391.42,379.76 391.08,382.32 391.00,388.00 391.00,388.00 391.00,418.00 391.00,418.00 391.00,418.00 391.00,519.00 391.00,519.00 391.00,523.71 390.46,541.77 391.74,544.98 392.45,546.77 393.51,548.07 395.11,549.15 398.22,551.23 402.41,550.99 406.00,551.00 412.23,551.01 427.31,552.61 430.83,546.78 432.22,544.46 432.00,540.66 432.00,538.00 432.00,538.00 432.00,415.00 432.00,415.00 432.00,415.00 432.00,388.00 432.00,388.00 431.95,384.84 431.93,381.75 429.57,379.31 426.98,376.64 423.40,377.01 420.00,377.21 420.00,377.21 397.02,377.21 397.02,377.21 Z M 567.00,476.00 C 567.00,476.00 511.71,402.00 511.71,402.00 511.71,402.00 499.87,386.00 499.87,386.0 498.08,383.62 495.39,379.61 492.83,378.17 490.33,376.78 486.80,377.00 484.00,377.00 484.00,377.00 468.00,377.00 468.00,377.00 459.94,377.02 456.17,377.87 456.00,387.00 456.00,387.00 456.00,513.00 456.00,513.00 456.00,513.00 456.00,539.00 456.00,539.00 456.02,541.90 455.82,545.22 457.74,547.61 460.67,551.26 465.80,550.99 470.00,551.00 470.00,551.00 484.00,551.00 484.00,551.00 487.31,550.96 491.11,550.90 493.69,548.49 497.31,545.11 496.00,532.05 496.00,527.00 496.00,527.00 496.00,451.00 496.00,451.00 496.00,451.00 514.37,475.00 514.37,475.00 514.37,475.00 552.13,526.00 552.13,526.00 555.75,530.85 566.77,547.21 571.09,549.43 574.15,551.01 577.65,550.98 581.00,551.00 581.00,551.00 595.00,551.00 595.00,551.00 604.09,550.89 607.87,548.52 608.00,539.00 608.00,539.00 608.00,415.00 608.00,415.00 608.00,415.00 608.00,388.00 608.00,388.00 607.95,384.86 607.96,381.82 605.57,379.43 602.78,376.64 598.62,377.01 595.00,377.00 591.05,376.99 574.63,376.58 572.04,377.60 570.62,378.15 569.64,378.91 568.74,380.15 566.72,382.90 567.01,386.75 567.00,390.00 567.00,390.00 567.00,476.00 567.00,476.00 Z M 672.00,418.00 C 672.00,418.00 737.00,418.00 737.00,418.00 745.03,417.89 748.84,415.44 749.00,407.00 749.00,407.00 749.00,388.00 749.00,388.00 748.95,384.45 748.90,381.10 745.77,378.74 743.09,376.71 739.19,377.01 736.00,377.00 736.00,377.00 657.00,377.00 657.00,377.00 651.17,377.00 636.40,375.35 632.85,380.23 630.76,383.10 631.01,387.59 631.00,391.00 631.00,391.00 631.00,513.00 631.00,513.00 631.00,513.00 631.00,539.00 631.00,539.00 631.05,542.28 631.06,545.14 633.43,547.72 636.70,551.30 641.58,550.99 646.00,551.00 646.00,551.00 734.00,551.00 734.00,551.00 745.25,550.98 748.98,550.03 749.00,538.00 749.00,538.00 749.00,522.00 749.00,522.00 748.95,513.20 747.33,510.13 738.00,510.00 738.00,510.00 672.00,510.00 672.00,510.00 672.00,510.00 672.00,484.00 672.00,484.00 672.00,484.00 736.00,484.00 736.00,484.00 746.47,483.98 748.98,481.47 749.00,471.00 749.00,471.00 749.00,456.00 749.00,456.00 748.98,446.32 747.52,443.14 737.00,443.00 737.00,443.00 672.00,443.00 672.00,443.00 672.00,443.00 672.00,418.00 672.00,418.00 Z" /></svg></a> <a class="tumblr-share-button" id="tumblr-share" href="#" onclick={clickTumblr}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#35465C" d="M13.5.5v5h5v4h-5V15c0 5 3.5 4.4 6 2.8v4.4c-6.7 3.2-12 0-12-4.2V9.5h-3V6.7c1-.3 2.2-.7 3-1.3.5-.5 1-1.2 1.4-2 .3-.7.6-1.7.7-3h3.8z"/></svg></a> <a class="reddit-share-button" id="reddit-share" href="#" onclick={clickReddit}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#5f99cf" d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.75-1.64-6.07-1.72.08-1.1.4-3.05 1.52-3.7.72-.4 1.73-.24 3 .5C17.2 6.3 18.46 7.5 20 7.5c1.65 0 3-1.35 3-3s-1.35-3-3-3c-1.38 0-2.54.94-2.88 2.22-1.43-.72-2.64-.8-3.6-.25-1.64.94-1.95 3.47-2 4.55-2.33.08-4.45.7-6.1 1.72C4.86 8.98 3.96 8.5 3 8.5c-1.65 0-3 1.35-3 3 0 1.32.84 2.44 2.05 2.84-.03.22-.05.44-.05.66 0 3.86 4.5 7 10 7s10-3.14 10-7c0-.22-.02-.44-.05-.66 1.2-.4 2.05-1.54 2.05-2.84zM2.3 13.37C1.5 13.07 1 12.35 1 11.5c0-1.1.9-2 2-2 .64 0 1.22.32 1.6.82-1.1.85-1.92 1.9-2.3 3.05zm3.7.13c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9.8 4.8c-1.08.63-2.42.96-3.8.96-1.4 0-2.74-.34-3.8-.95-.24-.13-.32-.44-.2-.68.15-.24.46-.32.7-.18 1.83 1.06 4.76 1.06 6.6 0 .23-.13.53-.05.67.2.14.23.06.54-.18.67zm.2-2.8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm5.7-2.13c-.38-1.16-1.2-2.2-2.3-3.05.38-.5.97-.82 1.6-.82 1.1 0 2 .9 2 2 0 .84-.53 1.57-1.3 1.87z"/></svg></a> <a class="linkedin-share-button" id="linkedin-share" href="#" onclick={clickLinkedin}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#0077b5" d="M6.5 21.5h-5v-13h5v13zM4 6.5C2.5 6.5 1.5 5.3 1.5 4s1-2.4 2.5-2.4c1.6 0 2.5 1 2.6 2.5 0 1.4-1 2.5-2.6 2.5zm11.5 6c-1 0-2 1-2 2v7h-5v-13h5V10s1.6-1.5 4-1.5c3 0 5 2.2 5 6.3v6.7h-5v-7c0-1-1-2-2-2z"/></svg></a> <a class="whatsapp-share-button" id="whatsapp-share" href="#" onclick={clickWhatsapp}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#25D366" d="M20.1 3.9C17.9 1.7 15 .5 12 .5 5.8.5.7 5.6.7 11.9c0 2 .5 3.9 1.5 5.6L.6 23.4l6-1.6c1.6.9 3.5 1.3 5.4 1.3 6.3 0 11.4-5.1 11.4-11.4-.1-2.8-1.2-5.7-3.3-7.8zM12 21.4c-1.7 0-3.3-.5-4.8-1.3l-.4-.2-3.5 1 1-3.4L4 17c-1-1.5-1.4-3.2-1.4-5.1 0-5.2 4.2-9.4 9.4-9.4 2.5 0 4.9 1 6.7 2.8 1.8 1.8 2.8 4.2 2.8 6.7-.1 5.2-4.3 9.4-9.5 9.4zm5.1-7.1c-.3-.1-1.7-.9-1.9-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1s-1.2-.5-2.3-1.4c-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6s.3-.3.4-.5c.2-.1.3-.3.4-.5.1-.2 0-.4 0-.5C10 9 9.3 7.6 9 7c-.1-.4-.4-.3-.5-.3h-.6s-.4.1-.7.3c-.3.3-1 1-1 2.4s1 2.8 1.1 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.3-.3-.4-.6-.5z"/></svg></a> <a class="email-share-button" id="email-share" href="#" onclick={clickEmail}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"><path fill="#777777" d="M22 4H2C.9 4 0 4.9 0 6v12c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM7.25 14.43l-3.5 2c-.08.05-.17.07-.25.07-.17 0-.34-.1-.43-.25-.14-.24-.06-.55.18-.68l3.5-2c.24-.14.55-.06.68.18.14.24.06.55-.18.68zm4.75.07c-.1 0-.2-.03-.27-.08l-8.5-5.5c-.23-.15-.3-.46-.15-.7.15-.22.46-.3.7-.14L12 13.4l8.23-5.32c.23-.15.54-.08.7.15.14.23.07.54-.16.7l-8.5 5.5c-.08.04-.17.07-.27.07zm8.93 1.75c-.1.16-.26.25-.43.25-.08 0-.17-.02-.25-.07l-3.5-2c-.24-.13-.32-.44-.18-.68s.44-.32.68-.18l3.5 2c.24.13.32.44.18.68z"/></svg></a></p>

              <CommentForm
                postId={this.state.postId}
                disabled={pv.post.locked}
              />
              {this.state.postRes.comments.length > 0 && this.sortRadios()}
              {this.state.commentViewType == CommentViewType.Tree &&
                this.commentsTree()}
              {this.state.commentViewType == CommentViewType.Chat &&
                this.commentsFlat()}
            </div>
            <div class="col-12 col-sm-12 col-md-4">{this.sidebar()}</div>
          </div>
        )}
      </div>
    );
  }

  sortRadios() {
    return (
      <>
        <div class="btn-group btn-group-toggle flex-wrap mr-3 mb-2">
          <label
            className={`btn btn-outline-secondary pointer ${
              this.state.commentSort === CommentSortType.Hot && "active"
            }`}
          >
            {i18n.t("hot")}
            <input
              type="radio"
              value={CommentSortType.Hot}
              checked={this.state.commentSort === CommentSortType.Hot}
              onChange={linkEvent(this, this.handleCommentSortChange)}
            />
          </label>
          <label
            className={`btn btn-outline-secondary pointer ${
              this.state.commentSort === CommentSortType.Top && "active"
            }`}
          >
            {i18n.t("top")}
            <input
              type="radio"
              value={CommentSortType.Top}
              checked={this.state.commentSort === CommentSortType.Top}
              onChange={linkEvent(this, this.handleCommentSortChange)}
            />
          </label>
          <label
            className={`btn btn-outline-secondary pointer ${
              this.state.commentSort === CommentSortType.New && "active"
            }`}
          >
            {i18n.t("new")}
            <input
              type="radio"
              value={CommentSortType.New}
              checked={this.state.commentSort === CommentSortType.New}
              onChange={linkEvent(this, this.handleCommentSortChange)}
            />
          </label>
          <label
            className={`btn btn-outline-secondary pointer ${
              this.state.commentSort === CommentSortType.Old && "active"
            }`}
          >
            {i18n.t("old")}
            <input
              type="radio"
              value={CommentSortType.Old}
              checked={this.state.commentSort === CommentSortType.Old}
              onChange={linkEvent(this, this.handleCommentSortChange)}
            />
          </label>
        </div>
        <div class="btn-group btn-group-toggle flex-wrap mb-2">
          <label
            className={`btn btn-outline-secondary pointer ${
              this.state.commentViewType === CommentViewType.Chat && "active"
            }`}
          >
            {i18n.t("chat")}
            <input
              type="radio"
              value={CommentViewType.Chat}
              checked={this.state.commentViewType === CommentViewType.Chat}
              onChange={linkEvent(this, this.handleCommentViewTypeChange)}
            />
          </label>
        </div>
      </>
    );
  }

  commentsFlat() {
    // These are already sorted by new
    return (
      <div>
        <CommentNodes
          nodes={commentsToFlatNodes(this.state.postRes.comments)}
          noIndent
          locked={this.state.postRes.post_view.post.locked}
          moderators={this.state.postRes.moderators}
          admins={this.state.siteRes.admins}
          postCreatorId={this.state.postRes.post_view.creator.id}
          showContext
          enableDownvotes={this.state.siteRes.site_view.site.enable_downvotes}
        />
      </div>
    );
  }

  sidebar() {
    return (
      <div class="mb-3">
        <Sidebar
          community_view={this.state.postRes.community_view}
          moderators={this.state.postRes.moderators}
          admins={this.state.siteRes.admins}
          online={this.state.postRes.online}
          enableNsfw={this.state.siteRes.site_view.site.enable_nsfw}
          showIcon
        />
      </div>
    );
  }

  handleCommentSortChange(i: Post, event: any) {
    i.state.commentSort = Number(event.target.value);
    i.state.commentViewType = CommentViewType.Tree;
    i.state.commentTree = buildCommentsTree(
      i.state.postRes.comments,
      i.state.commentSort
    );
    i.setState(i.state);
  }

  handleCommentViewTypeChange(i: Post, event: any) {
    i.state.commentViewType = Number(event.target.value);
    i.state.commentSort = CommentSortType.New;
    i.state.commentTree = buildCommentsTree(
      i.state.postRes.comments,
      i.state.commentSort
    );
    i.setState(i.state);
  }

  commentsTree() {
    return (
      <div>
        <CommentNodes
          nodes={this.state.commentTree}
          locked={this.state.postRes.post_view.post.locked}
          moderators={this.state.postRes.moderators}
          admins={this.state.siteRes.admins}
          postCreatorId={this.state.postRes.post_view.creator.id}
          enableDownvotes={this.state.siteRes.site_view.site.enable_downvotes}
        />
      </div>
    );
  }

  parseMessage(msg: any) {
    let op = wsUserOp(msg);
    console.log(msg);
    if (msg.error) {
      toast(i18n.t(msg.error), "danger");
      return;
    } else if (msg.reconnect) {
      let postId = Number(this.props.match.params.id);
      WebSocketService.Instance.send(wsClient.postJoin({ post_id: postId }));
      WebSocketService.Instance.send(
        wsClient.getPost({
          id: postId,
          auth: authField(false),
        })
      );
    } else if (op == UserOperation.GetPost) {
      let data = wsJsonToRes<GetPostResponse>(msg).data;
      this.state.postRes = data;
      this.state.commentTree = buildCommentsTree(
        this.state.postRes.comments,
        this.state.commentSort
      );
      this.state.loading = false;

      // Get cross-posts
      this.fetchCrossPosts();
      this.setState(this.state);
      setupTippy();
      if (!this.state.commentId) restoreScrollPosition(this.context);
    } else if (op == UserOperation.CreateComment) {
      let data = wsJsonToRes<CommentResponse>(msg).data;

      // Necessary since it might be a user reply, which has the recipients, to avoid double
      if (data.recipient_ids.length == 0) {
        this.state.postRes.comments.unshift(data.comment_view);
        insertCommentIntoTree(this.state.commentTree, data.comment_view);
        this.state.postRes.post_view.counts.comments++;
        this.setState(this.state);
        setupTippy();
      }
    } else if (
      op == UserOperation.EditComment ||
      op == UserOperation.DeleteComment ||
      op == UserOperation.RemoveComment
    ) {
      let data = wsJsonToRes<CommentResponse>(msg).data;
      editCommentRes(data.comment_view, this.state.postRes.comments);
      this.setState(this.state);
    } else if (op == UserOperation.SaveComment) {
      let data = wsJsonToRes<CommentResponse>(msg).data;
      saveCommentRes(data.comment_view, this.state.postRes.comments);
      this.setState(this.state);
      setupTippy();
    } else if (op == UserOperation.CreateCommentLike) {
      let data = wsJsonToRes<CommentResponse>(msg).data;
      createCommentLikeRes(data.comment_view, this.state.postRes.comments);
      this.setState(this.state);
    } else if (op == UserOperation.CreatePostLike) {
      let data = wsJsonToRes<PostResponse>(msg).data;
      createPostLikeRes(data.post_view, this.state.postRes.post_view);
      this.setState(this.state);
    } else if (
      op == UserOperation.EditPost ||
      op == UserOperation.DeletePost ||
      op == UserOperation.RemovePost ||
      op == UserOperation.LockPost ||
      op == UserOperation.StickyPost ||
      op == UserOperation.SavePost
    ) {
      let data = wsJsonToRes<PostResponse>(msg).data;
      this.state.postRes.post_view = data.post_view;
      this.setState(this.state);
      setupTippy();
    } else if (
      op == UserOperation.EditCommunity ||
      op == UserOperation.DeleteCommunity ||
      op == UserOperation.RemoveCommunity ||
      op == UserOperation.FollowCommunity
    ) {
      let data = wsJsonToRes<CommunityResponse>(msg).data;
      this.state.postRes.community_view = data.community_view;
      this.state.postRes.post_view.community = data.community_view.community;
      this.setState(this.state);
      this.setState(this.state);
    } else if (op == UserOperation.BanFromCommunity) {
      let data = wsJsonToRes<BanFromCommunityResponse>(msg).data;
      this.state.postRes.comments
        .filter(c => c.creator.id == data.person_view.person.id)
        .forEach(c => (c.creator_banned_from_community = data.banned));
      if (
        this.state.postRes.post_view.creator.id == data.person_view.person.id
      ) {
        this.state.postRes.post_view.creator_banned_from_community =
          data.banned;
      }
      this.setState(this.state);
    } else if (op == UserOperation.AddModToCommunity) {
      let data = wsJsonToRes<AddModToCommunityResponse>(msg).data;
      this.state.postRes.moderators = data.moderators;
      this.setState(this.state);
    } else if (op == UserOperation.BanPerson) {
      let data = wsJsonToRes<BanPersonResponse>(msg).data;
      this.state.postRes.comments
        .filter(c => c.creator.id == data.person_view.person.id)
        .forEach(c => (c.creator.banned = data.banned));
      if (
        this.state.postRes.post_view.creator.id == data.person_view.person.id
      ) {
        this.state.postRes.post_view.creator.banned = data.banned;
      }
      this.setState(this.state);
    } else if (op == UserOperation.AddAdmin) {
      let data = wsJsonToRes<AddAdminResponse>(msg).data;
      this.state.siteRes.admins = data.admins;
      this.setState(this.state);
    } else if (op == UserOperation.Search) {
      let data = wsJsonToRes<SearchResponse>(msg).data;
      this.state.crossPosts = data.posts.filter(
        p => p.post.id != Number(this.props.match.params.id)
      );
      this.setState(this.state);
    } else if (op == UserOperation.TransferSite) {
      let data = wsJsonToRes<GetSiteResponse>(msg).data;
      this.state.siteRes = data;
      this.setState(this.state);
    } else if (op == UserOperation.TransferCommunity) {
      let data = wsJsonToRes<GetCommunityResponse>(msg).data;
      this.state.postRes.community_view = data.community_view;
      this.state.postRes.post_view.community = data.community_view.community;
      this.state.postRes.moderators = data.moderators;
      this.setState(this.state);
    }
  }
}
